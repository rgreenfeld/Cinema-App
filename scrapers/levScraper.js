/**
 * Lev Cinema (רשת לב, Israel) scraper.
 *
 * Lev has no public JSON API — schedules are server-rendered directly into
 * each movie's detail page HTML (WordPress). Approach:
 *
 *   1. GET https://www.lev.co.il/  — discover every currently listed movie
 *      page URL (both "מציג עכשיו" and "בקרוב" sections link to
 *      /movies/{slug}/).
 *   2. GET each movie page and parse its embedded schedule.
 *
 * Each movie page repeats its schedule twice in the HTML: once as a "forloc
 * 1" block (bare `<a>` tags with placeholder-looking dates/times, apparently
 * used to seed the mobile select-dropdown flow) and once as a "forloc 2"
 * block with the real schedule, e.g.:
 *
 *   <div class="forloc 2"><h3>לב תל אביב</h3>
 *     <div class="showlist 456"><span>16/08&nbsp;ראשון</span>
 *       <div class='showitem' style='display:inline-block'>
 *         <a href='https://ticket.lev.co.il/order/603453' class='mobilelink'
 *            data-loc='לב תל אביב' data-pcode='603453'>17:20 </a>
 *         <span>מדובב (עברית) </span>   <!-- only present when relevant -->
 *       </div>
 *     </div>
 *   </div>
 *
 * Only showtimes wrapped in `<div class='showitem' ...>` are real — the
 * "forloc 1" duplicate has no such wrapper, so requiring it in the regex
 * naturally skips the placeholder block without needing to split by branch.
 *
 * Movie titles often carry their own "-מדובב" suffix (same convention as
 * Cinema City/MovieLand) which the shared uploader's normalizeMovieTitle.js
 * already strips and infers language/dubbed metadata from. The optional
 * trailing `<span>מדובב (X)</span>` tag (present only when a showtime's
 * language needs disambiguating) is parsed here for extra precision.
 *
 * No VIP/3D/IMAX-style hall markers were found anywhere in the schedule
 * markup, so screen_type is always 'רגיל'.
 */

const BASE_URL = 'https://www.lev.co.il';
const BOOKING_BASE_URL = 'https://ticket.lev.co.il/order';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const REQUEST_TIMEOUT_MS = 20000;
const MOVIE_FETCH_CONCURRENCY = 4;

function hasValue(v) {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

function decodeHtmlEntities(str) {
  return String(str)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtml(url) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

/**
 * Discover every /movies/{slug}/ URL linked from the homepage (covers both
 * "מציג עכשיו" now-showing and "בקרוב" coming-soon sections).
 */
function extractMovieUrls(homepageHtml) {
  const matches = homepageHtml.match(/https:\/\/www\.lev\.co\.il\/movies\/[^"'\s)]+\//g) || [];
  return Array.from(new Set(matches));
}

function extractMovieTitle(pageHtml) {
  const m = pageHtml.match(/<h1>([^<]+)<\/h1>/);
  return m ? decodeHtmlEntities(m[1]) : null;
}

/**
 * Resolve a bare dd/mm (no year, as the site emits it) into a concrete year,
 * assuming the date is upcoming relative to `referenceDate` — rolling over
 * to next year if the same-year candidate would be more than a month in
 * the past (handles schedules that cross a Dec→Jan boundary).
 */
function resolveYear(day, month, referenceDate) {
  const refYear = referenceDate.getFullYear();
  const candidate = new Date(refYear, month - 1, day);
  const diffDays = (candidate.getTime() - referenceDate.getTime()) / 86400000;
  return diffDays < -30 ? refYear + 1 : refYear;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Derive the project's Hebrew language tag + dubbed flag from a showtime's
 * optional trailing tag span, e.g. "מדובב (עברית)" -> { language: 'עברית',
 * isDubbed: true }. Returns nulls when no tag is present (the shared
 * uploader then infers language/dubbed from the movie title instead, which
 * already carries a "-מדובב" suffix when relevant).
 */
function normalizeLanguageTag(rawTag) {
  const tag = hasValue(rawTag) ? decodeHtmlEntities(rawTag) : '';
  if (!tag) return { language: null, isDubbed: null };

  const dubbedMatch = tag.match(/מדובב\s*\(([^)]+)\)/);
  if (dubbedMatch) return { language: dubbedMatch[1].trim(), isDubbed: true };

  if (/מדובב/.test(tag)) return { language: 'עברית', isDubbed: true };
  if (/כתוביות/.test(tag)) return { language: 'מקור עם כתוביות', isDubbed: false };

  return { language: null, isDubbed: null };
}

const SCHEDULE_TOKEN_RE =
  /<span>(\d{2})\/(\d{2})&nbsp;[^<]*<\/span>|<div class='showitem'[^>]*><a href='https:\/\/ticket\.lev\.co\.il\/order\/(\d+)' class='mobilelink' data-loc='([^']*)'(?:\s+data-pcode='[^']*')?>([^<]*)<\/a>(?:<span>([^<]*)<\/span>)?<\/div>/g;

function parseMovieSchedule(pageHtml, movieTitle, referenceDate) {
  const screenings = [];
  let currentDay = null;
  let currentMonth = null;

  for (const match of pageHtml.matchAll(SCHEDULE_TOKEN_RE)) {
    if (match[1] !== undefined) {
      currentDay = Number(match[1]);
      currentMonth = Number(match[2]);
      continue;
    }

    if (currentDay === null || currentMonth === null) continue;

    const pcode = match[3];
    const branch = decodeHtmlEntities(match[4] || '');
    const timeText = decodeHtmlEntities(match[5] || '');
    const timeMatch = timeText.match(/^(\d{1,2}):(\d{2})$/);
    if (!hasValue(pcode) || !branch || !timeMatch) continue;

    const year = resolveYear(currentDay, currentMonth, referenceDate);
    const dateTime = `${year}-${pad2(currentMonth)}-${pad2(currentDay)}T${pad2(+timeMatch[1])}:${timeMatch[2]}:00`;

    const { language, isDubbed } = normalizeLanguageTag(match[6]);

    screenings.push({
      cinema_chain: 'Lev',
      branch,
      movie_title: movieTitle,
      date_time: dateTime,
      screen_type: 'רגיל',
      ...(language !== null ? { language } : {}),
      ...(isDubbed !== null ? { is_dubbed: isDubbed } : {}),
      booking_url: `${BOOKING_BASE_URL}/${pcode}`,
      _pcode: pcode,
    });
  }

  return screenings;
}

async function scrapeMoviePage(url, referenceDate) {
  const html = await fetchHtml(url);
  const movieTitle = extractMovieTitle(html);
  if (!movieTitle) return [];
  return parseMovieSchedule(html, movieTitle, referenceDate);
}

/** Run async tasks with limited concurrency, preserving settled results. */
async function mapWithConcurrency(items, concurrency, fn) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function scrapeLev() {
  const referenceDate = new Date();
  const dedup = new Map();

  let homepageHtml;
  try {
    homepageHtml = await fetchHtml(`${BASE_URL}/`);
  } catch (err) {
    console.warn(`[lev] Warning: failed to fetch homepage (${err.message}).`);
    return [];
  }

  const movieUrls = extractMovieUrls(homepageHtml);
  console.log(`[lev] Discovered ${movieUrls.length} movie pages.`);

  const perMovieResults = await mapWithConcurrency(movieUrls, MOVIE_FETCH_CONCURRENCY, async (url) => {
    try {
      const screenings = await scrapeMoviePage(url, referenceDate);
      return { url, screenings };
    } catch (err) {
      console.warn(`[lev] Warning: failed to scrape ${url} (${err.message}).`);
      return { url, screenings: [] };
    }
  });

  for (const { url, screenings } of perMovieResults) {
    for (const screening of screenings) {
      const pcode = screening._pcode;
      delete screening._pcode;
      dedup.set(pcode, screening);
    }
    if (screenings.length > 0) {
      const title = screenings[0].movie_title;
      console.log(`[lev] ${title}: ${screenings.length} screenings`);
    } else {
      console.log(`[lev] ${url}: 0 screenings`);
    }
  }

  return Array.from(dedup.values()).sort((a, b) => a.date_time.localeCompare(b.date_time));
}

export default scrapeLev;
