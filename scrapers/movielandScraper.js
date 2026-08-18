/**
 * MovieLand (Israel) scraper.
 *
 * Data source: MovieLand's public JSON API used by its own site (Vue app,
 * see /js/events.js):
 *
 *   GET https://movieland.co.il/api/Events
 *     ?TheatreId={id}&MovieId=&Date=&HebrewSubs=&Dubbed=false&ThreeD=false
 *     &isVenueUpgrated=false&isHFR3D=false&isHideVODRent=true
 *
 * A single call per branch returns every movie currently scheduled there,
 * each with a `Dates` array covering the branch's entire published schedule
 * (weeks into the future) — no per-day iteration needed.
 *
 * Each entry in `Dates` is one screening:
 *   {
 *     Date: "2026-08-17T19:50:00",   // Israel local wall time, no tz suffix
 *     Hour: "19:50",
 *     EventId: "22046",
 *     TheaterId: 1293,
 *     SiteGroup: " כתוביות בעברית" | "מדובב לעברית, כתוביות בעברית" | "מדובב לרוסית" | ...,
 *     Dubbed: boolean,
 *     ThreeD: boolean,
 *     IsVip: boolean,
 *     BookingNativeUrl: "https://ecom.biggerpicture.ai/site/{TheaterId}?code={TheaterId}-{EventId}&saleChannelCode=web&languageid=he_IL"
 *   }
 *
 * Movie titles sometimes carry their own tag (e.g. "(מדובב)"), same as
 * Cinema City — normalizeMovieTitle.js (used by the shared uploader) strips
 * those and infers language/dubbed metadata from them. Here we additionally
 * derive a precise per-showtime language from `SiteGroup`/`Dubbed` since a
 * single movie can have both subtitled and dubbed-to-a-specific-language
 * showtimes without that being reflected in the title.
 *
 * Integration example (uploadToSupabase.js):
 *   import { scrapeMovieland } from './movielandScraper.js';
 *   const screenings = await scrapeMovieland();
 */

const BASE_URL = 'https://movieland.co.il';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Verified live branch IDs (from the site's embedded `quickOrder.theaters`).
// "מובילנד בת ים" is listed as "coming soon" (not yet open) and is skipped.
const BRANCHES = [
  { theaterId: 1293, name: 'הצוק ת"א' },
  { theaterId: 1291, name: 'חיפה' },
  { theaterId: 1290, name: 'כרמיאל' },
  { theaterId: 1292, name: 'נתניה' },
  { theaterId: 1294, name: 'עפולה' },
  { theaterId: 1295, name: 'עזריאלי ת"א- Summer Sky' },
];

const REQUEST_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasValue(v) {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

function toBooleanLike(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  const s = String(value).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTheaterEvents(theaterId) {
  const params = new URLSearchParams({
    TheatreId: String(theaterId),
    MovieId: '',
    Date: '',
    HebrewSubs: '',
    Dubbed: 'false',
    ThreeD: 'false',
    isVenueUpgrated: 'false',
    isHFR3D: 'false',
    isHideVODRent: 'true',
  });

  const url = `${BASE_URL}/api/Events?${params.toString()}`;
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    Referer: `${BASE_URL}/`,
    Origin: BASE_URL,
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
  };

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { headers });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for TheatreId=${theaterId}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      // 403s are often a transient anti-bot block (e.g. datacenter IP
      // rate-limiting) rather than a permanent one — retry a couple of
      // times with a delay before giving up on this branch.
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastErr;
}

/**
 * Derive the project's Hebrew language tag + dubbed flag from a MovieLand
 * showtime's SiteGroup label and Dubbed flag.
 *
 *   "מדובב ל<שפה>"                       -> that language, dubbed
 *   Dubbed / plain "מדובב"                -> 'עברית', dubbed (default dub target)
 *   contains "כתוביות"                    -> 'מקור עם כתוביות', not dubbed
 *   otherwise                             -> 'מקור', not dubbed
 */
function normalizeLanguage(dateEntry) {
  const group = hasValue(dateEntry?.SiteGroup) ? String(dateEntry.SiteGroup).trim() : '';

  const dubbedToMatch = group.match(/מדובב\s*ל(עברית|רוסית|אנגלית|צרפתית|ערבית)/);
  if (dubbedToMatch) return { language: dubbedToMatch[1], isDubbed: true };

  if (toBooleanLike(dateEntry?.Dubbed) || /מדובב/.test(group)) {
    return { language: 'עברית', isDubbed: true };
  }

  if (/כתוביות/.test(group)) return { language: 'מקור עם כתוביות', isDubbed: false };

  return { language: 'מקור', isDubbed: false };
}

function normalizeScreenType(dateEntry) {
  if (toBooleanLike(dateEntry?.IsVip)) return 'VIP';
  if (toBooleanLike(dateEntry?.ThreeD)) return '3D';
  return 'רגיל';
}

function parseTheaterEvents(movies, branchName) {
  const results = [];
  if (!Array.isArray(movies)) return results;

  for (const movie of movies) {
    try {
      const movieTitle = hasValue(movie?.Name) ? String(movie.Name).trim() : '';
      if (!movieTitle) continue;

      const dates = Array.isArray(movie?.Dates) ? movie.Dates : [];
      for (const dateEntry of dates) {
        const eventId = dateEntry?.EventId;
        const dateTime = hasValue(dateEntry?.Date) ? String(dateEntry.Date).trim() : '';
        if (!hasValue(eventId) || !dateTime) continue;

        const { language, isDubbed } = normalizeLanguage(dateEntry);

        results.push({
          cinema_chain: 'MovieLand',
          branch: `מובילנד ${branchName}`,
          movie_title: movieTitle,
          date_time: dateTime,
          screen_type: normalizeScreenType(dateEntry),
          language,
          is_dubbed: isDubbed,
          booking_url: hasValue(dateEntry?.BookingNativeUrl) ? String(dateEntry.BookingNativeUrl).trim() : null,
          _eventId: String(eventId).trim(),
        });
      }
    } catch (err) {
      const movieName = hasValue(movie?.Name) ? String(movie.Name) : 'unknown movie';
      console.warn(`[movieland] Warning: failed while parsing movie entry (${movieName}): ${err.message}`);
    }
  }

  return results;
}

export async function scrapeMovieland() {
  const dedup = new Map();

  for (const branch of BRANCHES) {
    try {
      const movies = await fetchTheaterEvents(branch.theaterId);
      const screenings = parseTheaterEvents(movies, branch.name);
      for (const screening of screenings) {
        const key = `${branch.theaterId}:${screening._eventId}`;
        delete screening._eventId;
        dedup.set(key, screening);
      }
      console.log(`[movieland] ${branch.name}: ${screenings.length} screenings`);
    } catch (err) {
      console.warn(`[movieland] Warning: failed to fetch branch "${branch.name}" (${err.message}).`);
    }
  }

  return Array.from(dedup.values()).sort((a, b) => a.date_time.localeCompare(b.date_time));
}

export default scrapeMovieland;
