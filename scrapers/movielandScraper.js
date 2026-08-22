/**
 * MovieLand (Israel) scraper.
 */

// ברירת המחדל היא הפנייה הישירה. אם יוגדר משתנה סביבה - הפנייה תנותב דרך Cloudflare Worker Proxy.
const BASE_URL = (process.env.MOVIELAND_PROXY_URL || process.env.MOVIELAND_BASE_URL || 'https://movieland.co.il').replace(/\/$/, '');
const PROXY_SECRET = process.env.MOVIELAND_PROXY_SECRET || '';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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
    Referer: 'https://movieland.co.il/',
    Origin: 'https://movieland.co.il',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
  };

  if (PROXY_SECRET) {
    headers['X-Custom-Auth'] = PROXY_SECRET;
  }

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
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastErr;
}

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