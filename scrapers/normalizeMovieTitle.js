/**
 * normalizeMovieTitle.js
 *
 * A robust movie-title sanitizer + language/format extractor for the
 * Cinema City scraper → Supabase upload flow.
 *
 * Cinema chains (e.g. Cinema City) embed language, dubbing, or edition
 * attributes directly inside the movie title string, e.g.:
 *
 *   "האודיסאה - רוסית"
 *   "האודיסאה (מדובב)"
 *   "האודיסאה - אנגלית"
 *   "האודיסאה [צרפתית]"
 *   "האודיסאה – מדובב לרוסית"
 *
 * This causes two problems this module solves:
 *   1. Duplicate movie records (one per language variant) instead of a
 *      single unified movie ("האודיסאה").
 *   2. Language metadata embedded in the title instead of stored in
 *      dedicated fields, breaking language filtering.
 *
 * The single entry point `normalizeMovieTitle(rawTitle)` returns:
 *   {
 *     cleanTitle: string,   // the base movie title with all tags stripped
 *     language: string,     // one of: 'hebrew' | 'english' | 'russian'
 *                           //         | 'french' | 'arabic' | 'original'
 *     isDubbed: boolean     // true when dubbed, false otherwise
 *   }
 *
 * It is intentionally defensive: non-string / null / unexpected input always
 * returns a safe default object so scraping/uploading never crashes.
 */

// ─── Language tag patterns (Hebrew + English, case-insensitive) ────────────
// Each pattern is an array of alternative regexes so we can match the variety
// of suffixes the site emits. Regexes are applied to the WHOLE title so a tag
// can appear anywhere (start/end), though in practice they are trailing.

// Token sanitizers: normalize dashes to a single hyphen and collapse inner
// whitespace so matching is tolerant of "- רוסית", "–רוסית", "( רוסית )" etc.
const collapseSpaces = (s) => s.replace(/\s+/g, ' ').trim();
const normalizeDashes = (s) => s.replace(/[–—‑]/g, '-');

// ─── Canonical tag → { language, isDubbed } mapping ────────────────────────
// Each entry: a regex that matches the tag word/phrase, and the result.
// Order matters: more specific patterns (e.g. "מדובב לרוסית") must come
// before the generic ones ("מדובב", "רוסית") so we don't collide.

const TAG_RULES = [
  // Hebrew-dubbed explicitly: "מדובב לעברית" / "dubbed in hebrew"
  { re: /מדובב\s*לעברית|dubbed\s*(?:in\s*)?hebrew/i, language: 'hebrew', isDubbed: true },
  // English-dubbed explicitly: "מדובב לאנגלית" / "dubbed in english"
  { re: /מדובב\s*לאנגלית|dubbed\s*(?:in\s*)?english/i, language: 'english', isDubbed: true },
  // Russian-dubbed explicitly: "מדובב לרוסית" / "dubbed in russian"
  { re: /מדובב\s*לרוסית|dubbed\s*(?:in\s*)?russian/i, language: 'russian', isDubbed: true },
  // French-dubbed explicitly: "מדובב לצרפתית" / "dubbed in french"
  { re: /מדובב\s*לצרפתית|dubbed\s*(?:in\s*)?french/i, language: 'french', isDubbed: true },
  // Arabic-dubbed explicitly: "מדובב לערבית" / "dubbed in arabic"
  { re: /מדובב\s*לערבית|dubbed\s*(?:in\s*)?arabic/i, language: 'arabic', isDubbed: true },
  // Plain dubbed: "מדובב" / "dubbed" → Hebrew-dubbed (no specific target language)
  { re: /מדובב|dubbed/i, language: 'hebrew', isDubbed: true },

  // Plain language tags (not dubbed) → language with isDubbed: false.
  { re: /רוסית|russian/i, language: 'russian', isDubbed: false },
  { re: /צרפתית|french/i, language: 'french', isDubbed: false },
  { re: /ערבית|arabic/i, language: 'arabic', isDubbed: false },
  // English — includes subtitled English. "אנגלית" / "english" / "מתורגם".
  { re: /אנגלית|english|subtitled|subtitles|מתורגם/i, language: 'english', isDubbed: false },
  // Hebrew (explicit) → treat as original/unspecified audio.
  { re: /עברית|hebrew/i, language: 'hebrew', isDubbed: false },
];

// ─── English code → Hebrew tag (for the DB / frontend) ──────────────────────
// The DB & frontend use Hebrew tags. Map the extractor's English codes back.
export const LANGUAGE_TO_HEBREW = {
  hebrew: 'עברית',
  english: 'אנגלית',
  russian: 'רוסית',
  french: 'צרפתית',
  arabic: 'ערבית',
  original: 'מקור',
};

const TRAILING_TAG_SOURCE = [
  'מדובב\\s*לעברית',
  'מדובב\\s*לאנגלית',
  'מדובב\\s*לרוסית',
  'מדובב\\s*לצרפתית',
  'מדובב\\s*לערבית',
  'dubbed\\s*(?:in\\s*)?hebrew',
  'dubbed\\s*(?:in\\s*)?english',
  'dubbed\\s*(?:in\\s*)?russian',
  'dubbed\\s*(?:in\\s*)?french',
  'dubbed\\s*(?:in\\s*)?arabic',
  'מדובב',
  'dubbed',
  'רוסית',
  'russian',
  'צרפתית',
  'french',
  'ערבית',
  'arabic',
  'אנגלית',
  'english',
  'עברית',
  'hebrew',
  'מתורגם',
  'subtitled',
  'subtitles',
].join('|');

const TRAILING_DECORATOR_PATTERNS = [
  new RegExp(`\\s*[-,:]\\s*(?:${TRAILING_TAG_SOURCE})\\s*$`, 'i'),
  new RegExp(`\\s*\\((?:${TRAILING_TAG_SOURCE})\\)\\s*$`, 'i'),
  new RegExp(`\\s*\\[(?:${TRAILING_TAG_SOURCE})\\]\\s*$`, 'i'),
  new RegExp(`\\s+(?:${TRAILING_TAG_SOURCE})\\s*$`, 'i'),
  /\s*[-,:]\s*הסרט\s*$/i,
  /\s+הסרט\s*$/i,
  /\s*[.!?,:;]+\s*$/,
];

/**
 * Remove ALL recognized language/dubbing tags from a title, returning the
 * cleaned base title. Also trims whitespace and cleans up dangling
 * separators (hyphens, dashes, brackets) left behind.
 *
 * @param {string} rawTitle  the raw movie title (may contain tags)
 * @returns {string} the cleaned title, or '' if input was empty/invalid
 */
function stripTags(rawTitle) {
  if (typeof rawTitle !== 'string' || rawTitle.trim() === '') return '';

  let t = collapseSpaces(normalizeDashes(rawTitle));

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of TRAILING_DECORATOR_PATTERNS) {
      const next = t.replace(pattern, '').trim();
      if (next !== t) {
        t = next;
        changed = true;
      }
    }
  }

  // Clean up leftover separators / dangling brackets.
  t = t
    .replace(/^[\s\-,.]+/, '')
    .replace(/[\s\-,.]+$/, '')
    .replace(/\s*[([]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return t;
}

/**
 * Extract the language + isDubbed metadata from a raw title.
 *
 * @param {string} rawTitle  the raw movie title
 * @returns {{ language: string, isDubbed: boolean }}
 */
function extractMeta(rawTitle) {
  if (typeof rawTitle !== 'string' || rawTitle.trim() === '') {
    return { language: 'original', isDubbed: false };
  }

  const t = collapseSpaces(normalizeDashes(rawTitle));

  for (const rule of TAG_RULES) {
    if (rule.re.test(t)) {
      return { language: rule.language, isDubbed: rule.isDubbed };
    }
  }

  // No recognizable tag → original language, not dubbed.
  return { language: 'original', isDubbed: false };
}

/**
 * Main entry point. Sanitize a raw movie title into a clean base title plus
 * structured language / dubbing metadata.
 *
 * @param {string} rawTitle  the raw title as scraped from the cinema site
 * @returns {{ cleanTitle: string, language: string, isDubbed: boolean }}
 */
export function normalizeMovieTitle(rawTitle) {
  // Defensive: never throw on unexpected input.
  if (rawTitle === null || rawTitle === undefined) {
    return { cleanTitle: '', language: 'original', isDubbed: false };
  }
  if (typeof rawTitle !== 'string') {
    // Coerce numbers etc. gracefully.
    rawTitle = String(rawTitle);
  }

  const meta = extractMeta(rawTitle);
  const stripped = stripTags(rawTitle);
  const fallback = collapseSpaces(normalizeDashes(rawTitle));
  // Never return an empty clean title when the source title is usable.
  const cleanTitle = stripped || fallback;

  return {
    cleanTitle,
    language: meta.language,
    isDubbed: meta.isDubbed,
  };
}

// ─── Self-test (run with: node scrapers/normalizeMovieTitle.js) ────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = [
    // [input, expectedClean, expectedLanguage, expectedIsDubbed]
    ['האודיסאה - רוסית', 'האודיסאה', 'russian', false],
    ['האודיסאה - מדובב לעברית', 'האודיסאה', 'hebrew', true],
    ['האודיסאה - מדובב לאנגלית', 'האודיסאה', 'english', true],
    ['האודיסאה (רוסית)', 'האודיסאה', 'russian', false],
    ['האודיסאה – רוסית', 'האודיסאה', 'russian', false],
    ['האודיסאה (מדובב)', 'האודיסאה', 'hebrew', true],
    ['האודיסאה [מדובב]', 'האודיסאה', 'hebrew', true],
    ['האודיסאה - מדובב', 'האודיסאה', 'hebrew', true],
    ['האודיסאה - אנגלית', 'האודיסאה', 'english', false],
    ['האודיסאה (צרפתית)', 'האודיסאה', 'french', false],
    ['האודיסאה (מתורגם)', 'האודיסאה', 'english', false],
    ['האודיסאה - מתורגם', 'האודיסאה', 'english', false],
    ['האודיסאה - מדובב לרוסית', 'האודיסאה', 'russian', true],
    ['האודיסאה-מדובב לרוסית', 'האודיסאה', 'russian', true],
    ['The Odyssey (English)', 'The Odyssey', 'english', false],
    ['The Odyssey - Dubbed', 'The Odyssey', 'hebrew', true],
    ['The Odyssey (Hebrew)', 'The Odyssey', 'hebrew', false],
    ['ספיידרמן: יום חדש-מדובב לצרפתית', 'ספיידרמן: יום חדש', 'french', true],
    ['מואנה (לייב אקשן)-מדובב', 'מואנה (לייב אקשן)', 'hebrew', true],
    ['צעצוע של סיפור 5-מדובב לצרפתית', 'צעצוע של סיפור 5', 'french', true],
    ['קופה ראשית: הסרט', 'קופה ראשית', 'original', false],
    ['ההזמנה.', 'ההזמנה', 'original', false],
    ['האודיסאה', 'האודיסאה', 'original', false],
    ['Null', 'Null', 'original', false],
    ['null', 'null', 'original', false],
    ['מדובב', 'מדובב', 'hebrew', true],
    ['', '', 'original', false],
    [null, '', 'original', false],
    [undefined, '', 'original', false],
    [123, '123', 'original', false],
  ];

  let pass = 0;
  let fail = 0;
  for (const [input, clean, lang, dubbed] of tests) {
    const r = normalizeMovieTitle(input);
    const ok =
      r.cleanTitle === clean && r.language === lang && r.isDubbed === dubbed;
    if (ok) pass++;
    else {
      fail++;
      console.log(
        `✗ normalizeMovieTitle(${JSON.stringify(input)}) → ${JSON.stringify(r)}` +
          ` (expected ${JSON.stringify({ cleanTitle: clean, language: lang, isDubbed: dubbed })})`
      );
    }
  }
  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
}
