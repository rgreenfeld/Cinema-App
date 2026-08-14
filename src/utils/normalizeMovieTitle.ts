const collapseSpaces = (s: string) => s.replace(/\s+/g, ' ').trim();
const normalizeDashes = (s: string) => s.replace(/[–—‑]/g, '-');

const TAG_RULES = [
  { re: /מדובב\s*לעברית|dubbed\s*(?:in\s*)?hebrew/i, language: 'hebrew', isDubbed: true },
  { re: /מדובב\s*לאנגלית|dubbed\s*(?:in\s*)?english/i, language: 'english', isDubbed: true },
  { re: /מדובב\s*לרוסית|dubbed\s*(?:in\s*)?russian/i, language: 'russian', isDubbed: true },
  { re: /מדובב\s*לצרפתית|dubbed\s*(?:in\s*)?french/i, language: 'french', isDubbed: true },
  { re: /מדובב\s*לערבית|dubbed\s*(?:in\s*)?arabic/i, language: 'arabic', isDubbed: true },
  { re: /מדובב|dubbed/i, language: 'hebrew', isDubbed: true },
  { re: /רוסית|russian/i, language: 'russian', isDubbed: false },
  { re: /צרפתית|french/i, language: 'french', isDubbed: false },
  { re: /ערבית|arabic/i, language: 'arabic', isDubbed: false },
  { re: /אנגלית|english|subtitled|subtitles|מתורגם/i, language: 'english', isDubbed: false },
  { re: /עברית|hebrew/i, language: 'hebrew', isDubbed: false },
] as const;

const TRAILING_TAG_SOURCE = [
  'מתורגם\\s*רוסית',
  'מתורגם\\s*צרפתית',
  'מתורגם\\s*ערבית',
  'מתורגם\\s*אנגלית',
  'מתורגם\\s*עברית',
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
  new RegExp(`\\s*[-,:]?\\s*(?:${TRAILING_TAG_SOURCE})(?:\\s*[-:]\\s*|\\s+)[А-Яа-яЁё][А-Яа-яЁё0-9 .,!?'"()\\-:]*$`, 'i'),
  new RegExp(`\\s*[-,:]\\s*(?:${TRAILING_TAG_SOURCE})\\s*$`, 'i'),
  new RegExp(`\\s*\\((?:${TRAILING_TAG_SOURCE})\\)\\s*$`, 'i'),
  new RegExp(`\\s*\\[(?:${TRAILING_TAG_SOURCE})\\]\\s*$`, 'i'),
  new RegExp(`\\s+(?:${TRAILING_TAG_SOURCE})\\s*$`, 'i'),
  /\s*[-,:]\s*הסרט\s*$/i,
  /\s+הסרט\s*$/i,
  /\s*[.!?,:;]+\s*$/,
];

function stripTags(rawTitle: string): string {
  let title = collapseSpaces(normalizeDashes(rawTitle));

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of TRAILING_DECORATOR_PATTERNS) {
      const next = title.replace(pattern, '').trim();
      if (next !== title) {
        title = next;
        changed = true;
      }
    }
  }

  return title
    .replace(/^[\s\-,.]+/, '')
    .replace(/[\s\-,.]+$/, '')
    .replace(/\s*[([]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractMeta(rawTitle: string): { language: string; isDubbed: boolean } {
  const title = collapseSpaces(normalizeDashes(rawTitle));
  for (const rule of TAG_RULES) {
    if (rule.re.test(title)) {
      return { language: rule.language, isDubbed: rule.isDubbed };
    }
  }
  return { language: 'original', isDubbed: false };
}

export function normalizeMovieTitle(rawTitle: string | null | undefined): {
  cleanTitle: string;
  language: string;
  isDubbed: boolean;
} {
  if (rawTitle === null || rawTitle === undefined) {
    return { cleanTitle: '', language: 'original', isDubbed: false };
  }

  const title = typeof rawTitle === 'string' ? rawTitle : String(rawTitle);
  const meta = extractMeta(title);
  const cleanTitle = stripTags(title) || collapseSpaces(normalizeDashes(title));

  return {
    cleanTitle,
    language: meta.language,
    isDubbed: meta.isDubbed,
  };
}