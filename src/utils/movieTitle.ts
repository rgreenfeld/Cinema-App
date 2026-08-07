/**
 * movieTitle.ts
 *
 * A browser-safe movie-title normalizer used on the frontend to collapse
 * language/dubbing variants of the same film into a single base title.
 *
 * Cinema chains (e.g. Cinema City) embed language / dubbing / edition
 * attributes directly inside the movie title string, e.g.:
 *
 *   "האודיסאה - רוסית"
 *   "האודיסאה (מדובב)"
 *   "האודיסאה [צרפתית]"
 *   "ספיידרמן: יום חדש-מדובב לרוסית"
 *
 * This causes duplicate entries in the movie selection dropdown (one per
 * language variant). This module strips those suffixes so all variants of a
 * film reduce to a single clean base title.
 *
 * The single entry point `cleanMovieTitle(rawTitle)` returns a string.
 * It is intentionally defensive: non-string / null / unexpected input always
 * returns the input unchanged (or '' when empty).
 */

// ─── Language / dubbing tag patterns (Hebrew + English, case-insensitive) ──
// Order matters: more specific patterns (e.g. "מדובב לרוסית") must come before
// the generic ones ("מדובב", "רוסית") so we don't collide.

const TAG_RULES: { re: RegExp }[] = [
  // Specific dubbed-target phrases first (most specific).
  { re: /מדובב\s*לרוסית|dubbed\s*(?:in\s*)?russian/i },
  { re: /מדובב\s*לצרפתית|dubbed\s*(?:in\s*)?french/i },
  { re: /מדובב\s*לערבית|dubbed\s*(?:in\s*)?arabic/i },
  // Plain dubbed → Hebrew-dubbed (no specific target language).
  { re: /מדובב\s*ל|מדובב|dubbed/i },
  // Plain language tags (not dubbed).
  { re: /רוסית|russian/i },
  { re: /צרפתית|french/i },
  { re: /ערבית|arabic/i },
  // English — includes subtitled English ("מתורגם").
  { re: /אנגלית|english|subtitled|subtitles|מתורגם/i },
  // Hebrew (explicit) → treat as original/unspecified audio.
  { re: /עברית|hebrew/i },
];

const collapseSpaces = (s: string): string => s.replace(/\s+/g, ' ').trim();
const normalizeDashes = (s: string): string => s.replace(/[–—‑]/g, '-');

/**
 * Remove ALL recognized language/dubbing tags from a title, returning the
 * cleaned base title. Also trims whitespace and cleans up dangling
 * separators (hyphens, dashes, brackets) left behind.
 */
function stripTags(rawTitle: string): string {
  let t = collapseSpaces(normalizeDashes(rawTitle));

  for (const { re } of TAG_RULES) {
    // Remove the tag word/phrase itself.
    t = t.replace(re, ' ');
  }

  // Clean up leftover separators / dangling brackets.
  t = t
    // Remove leading/trailing hyphens, dashes, parens, brackets and spaces.
    .replace(/^[\s\-–—‑()[\],.]+/, '')
    .replace(/[\s\-–—‑()[\],.]+$/, '')
    // Collapse any double separators left mid-string.
    .replace(/\s*[-–—‑()[\]]\s*[-–—‑()[\]]+/g, ' ')
    // Collapse multiple spaces.
    .replace(/\s{2,}/g, ' ')
    .trim();

  return t;
}

/**
 * Normalize a raw movie title into a clean base title with language/dubbing
 * suffixes removed. Returns the input unchanged when it isn't a non-empty
 * string (so callers never get a surprising empty value for valid input).
 */
export function cleanMovieTitle(rawTitle: string): string {
  if (typeof rawTitle !== 'string' || rawTitle.trim() === '') return rawTitle;

  const cleaned = stripTags(rawTitle);
  return cleaned || rawTitle.trim();
}
