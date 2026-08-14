/**
 * Hot Cinema (Israel) scraper.
 *
 * Integration example (uploadToSupabase.js):
 *   import { scrapeHotCinema } from './hotcinemaScraper.js';
 *   const hotScreenings = await scrapeHotCinema();
 *   // merge with other chains and upload as needed.
 */

const BASE_URL = 'https://hotcinema.co.il';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const ENDPOINTS = {
  theaterEvents2: '/tickets/TheaterEvents2',
  theaterEvents: '/tickets/TheaterEvents',
  movieEvents: '/tickets/movieevents',
};

function hasValue(v) {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

function firstNonEmpty(...values) {
  for (const v of values) {
    if (hasValue(v)) return v;
  }
  return null;
}

function toBooleanLike(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  const s = String(value).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function toIsoDateTime(rawDate, rawFormattedDate, rawHour) {
  const date = firstNonEmpty(rawDate, rawFormattedDate);
  if (date) {
    const normalized = String(date).trim().replace(' ', 'T');

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) return normalized;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) return `${normalized}:00`;

    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  const hour = hasValue(rawHour) ? String(rawHour).trim() : '';
  if (date && /^\d{4}-\d{2}-\d{2}/.test(String(date)) && /^\d{1,2}:\d{2}$/.test(hour)) {
    const day = String(date).slice(0, 10);
    const [h, m] = hour.split(':');
    return `${day}T${h.padStart(2, '0')}:${m}:00`;
  }

  return null;
}

function normalizeLanguage({ dateEntry, movieEntry, screeningType, movieTitle }) {
  const dubbed = firstNonEmpty(dateEntry?.DubbedLanguage, movieEntry?.DubbedLanguage);
  const subtitled = firstNonEmpty(dateEntry?.SubtitledLanguage, movieEntry?.SubtitledLanguage);
  const type = hasValue(screeningType) ? String(screeningType).toLowerCase() : '';
  const title = hasValue(movieTitle) ? String(movieTitle).toLowerCase() : '';

  if (hasValue(dubbed) || type.includes('מדובב') || type.includes('dub') || title.includes('מדובב')) return 'מדובב';
  if (hasValue(subtitled) || type.includes('כתוביות') || type.includes('subtit') || title.includes('כתוביות') || title.includes('מתורגם')) return 'מקור עם כתוביות';

  return 'מקור';
}

function normalizeScreenType({ dateEntry, movieEntry, screeningType, movieTitle }) {
  const type = hasValue(screeningType) ? String(screeningType).toLowerCase() : '';
  const title = hasValue(movieTitle) ? String(movieTitle).toLowerCase() : '';

  if (toBooleanLike(dateEntry?.IsVIP) || type.includes('vip')) return 'VIP';
  if (toBooleanLike(dateEntry?.Is3D) || toBooleanLike(movieEntry?.Is3D) || type.includes('3d') || title.includes('3d')) return '3D';

  const hasAtmos =
    toBooleanLike(dateEntry?.IsAtmos) ||
    toBooleanLike(dateEntry?.IsAtmos2D) ||
    toBooleanLike(dateEntry?.IsAtmos3D) ||
    toBooleanLike(movieEntry?.IsAtmos2D) ||
    toBooleanLike(movieEntry?.IsAtmos3D) ||
    type.includes('atmos') ||
    title.includes('atmos');

  if (hasAtmos) return 'Atmos';

  return 'רגיל';
}

function normalizeHotBranchName(rawTheaterName) {
  const name = hasValue(rawTheaterName) ? String(rawTheaterName).trim() : '';
  if (!name) return null;

  // Hot feed sometimes returns a Cyrillic variant for Netanya.
  if (name === 'Натания') return 'נתניה';

  return name;
}

function buildBookingUrl(eventId, theaterId) {
  const eid = hasValue(eventId) ? String(eventId).trim() : '';
  const tid = hasValue(theaterId) ? String(theaterId).trim() : '';
  if (!eid || !tid) return null;

  return `${BASE_URL}/order/?eventID=${encodeURIComponent(eid)}&theaterId=${encodeURIComponent(tid)}`;
}

async function fetchJson(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${path}`);
  }

  return await res.json();
}

function buildTheaterNameMap(movieEvents) {
  const map = new Map();
  if (!Array.isArray(movieEvents)) return map;

  for (const item of movieEvents) {
    const theaterId = firstNonEmpty(item?.TheaterID, item?.TheaterId);
    const theaterName = firstNonEmpty(item?.TheaterName, item?.TheaterNameRussian);
    if (!hasValue(theaterId) || !hasValue(theaterName)) continue;
    map.set(String(theaterId), String(theaterName).trim());
  }

  return map;
}

function extractMovieEntries(theaterEventsPayload) {
  if (Array.isArray(theaterEventsPayload)) return theaterEventsPayload;

  if (
    theaterEventsPayload &&
    typeof theaterEventsPayload === 'object' &&
    Array.isArray(theaterEventsPayload.TheaterEvents)
  ) {
    return theaterEventsPayload.TheaterEvents;
  }

  return [];
}

async function scrapeViaJsonApi() {
  let theaterMapPayload = [];
  let theaterEventsPayload = null;

  try {
    theaterMapPayload = await fetchJson(ENDPOINTS.movieEvents);
  } catch (err) {
    console.warn(`[hotcinema] Warning: failed to fetch theater mapping (${err.message}).`);
  }

  try {
    theaterEventsPayload = await fetchJson(ENDPOINTS.theaterEvents2);
  } catch (err) {
    console.warn(`[hotcinema] Warning: failed to fetch TheaterEvents2 (${err.message}). Trying TheaterEvents...`);
    try {
      theaterEventsPayload = await fetchJson(ENDPOINTS.theaterEvents);
    } catch (fallbackErr) {
      console.warn(`[hotcinema] Warning: failed to fetch TheaterEvents (${fallbackErr.message}).`);
      return [];
    }
  }

  const theaterNameById = buildTheaterNameMap(theaterMapPayload);
  const movieEntries = extractMovieEntries(theaterEventsPayload);

  const dedup = new Map();

  for (const movieEntry of movieEntries) {
    try {
      const movieTitle = hasValue(movieEntry?.MovieName) ? String(movieEntry.MovieName).trim() : '';
      if (!movieTitle) continue;

      const dates = Array.isArray(movieEntry?.Dates) ? movieEntry.Dates : [];
      for (const dateEntry of dates) {
        const theaterId = firstNonEmpty(dateEntry?.TheaterId, dateEntry?.TheaterID);
        const eventId = firstNonEmpty(dateEntry?.EventId, dateEntry?.EventID);

        if (!hasValue(theaterId) || !hasValue(eventId)) continue;

        const showTime = toIsoDateTime(dateEntry?.Date, dateEntry?.FormattedDate, dateEntry?.Hour);
        if (!showTime) continue;

        const screeningType = firstNonEmpty(dateEntry?.ScreeningType, movieEntry?.ScreeningType);
        const language = normalizeLanguage({ dateEntry, movieEntry, screeningType, movieTitle });
        const screenType = normalizeScreenType({ dateEntry, movieEntry, screeningType, movieTitle });
        const theaterIdKey = String(theaterId).trim();
        const rawCinemaName = theaterNameById.get(theaterIdKey);
        const normalizedTheaterName = normalizeHotBranchName(rawCinemaName);
        const cinemaName = hasValue(normalizedTheaterName)
          ? `הוט סינמה ${normalizedTheaterName}`
          : `הוט סינמה ${theaterIdKey}`;

        const screening = {
          cinema_chain: 'Hot Cinema',
          branch: cinemaName,
          movie_title: movieTitle,
          date_time: showTime,
          screen_type: screenType,
          language,
          booking_url: buildBookingUrl(eventId, theaterId),
        };

        dedup.set(`${theaterIdKey}:${String(eventId).trim()}`, screening);
      }
    } catch (err) {
      const movieName = hasValue(movieEntry?.MovieName) ? String(movieEntry.MovieName) : 'unknown movie';
      console.warn(`[hotcinema] Warning: failed while parsing movie entry (${movieName}): ${err.message}`);
    }
  }

  return Array.from(dedup.values()).sort((a, b) => a.date_time.localeCompare(b.date_time));
}

async function scrapeViaHtmlFallback() {
  let cheerio;
  try {
    cheerio = await import('cheerio');
  } catch {
    console.warn('[hotcinema] Warning: cheerio is not installed, HTML fallback skipped. Install with: npm i cheerio');
    return [];
  }

  try {
    const res = await fetch(BASE_URL, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      },
    });

    if (!res.ok) {
      console.warn(`[hotcinema] Warning: HTML fallback failed with HTTP ${res.status}.`);
      return [];
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const results = [];

    // Generic fallback for embedded schedule cards if API endpoints are unavailable.
    $('[data-eventid], [data-event-id]').each((_, el) => {
      const eventId =
        $(el).attr('data-eventid') ||
        $(el).attr('data-event-id') ||
        $(el).attr('eventid');

      const theaterId =
        $(el).attr('data-theaterid') ||
        $(el).attr('data-theater-id') ||
        $(el).attr('theaterid');

      const movieTitle =
        $(el).attr('data-movie-name') ||
        $(el).find('[data-movie-name], .movie-title, .title').first().text().trim();

      const timeRaw =
        $(el).attr('data-date') ||
        $(el).attr('data-datetime') ||
        $(el).find('time').attr('datetime') ||
        '';

      const cinemaName =
        $(el).attr('data-theater-name') ||
        $(el).find('[data-theater-name], .theater-name, .cinema-name').first().text().trim();

      if (!hasValue(eventId) || !hasValue(theaterId) || !hasValue(movieTitle)) return;

      const showTime = toIsoDateTime(timeRaw, null, null);
      if (!showTime) return;

      results.push({
        cinema_chain: 'Hot Cinema',
        branch: hasValue(cinemaName) ? String(cinemaName).trim() : `הוט סינמה ${String(theaterId).trim()}`,
        movie_title: String(movieTitle).trim(),
        date_time: showTime,
        screen_type: 'רגיל',
        language: 'מקור',
        booking_url: buildBookingUrl(eventId, theaterId),
      });
    });

    return results;
  } catch (err) {
    console.warn(`[hotcinema] Warning: HTML fallback parsing failed (${err.message}).`);
    return [];
  }
}

export async function scrapeHotCinema() {
  try {
    const apiResults = await scrapeViaJsonApi();
    if (apiResults.length > 0) return apiResults;

    console.warn('[hotcinema] Warning: API returned no screenings. Trying HTML fallback...');
    return await scrapeViaHtmlFallback();
  } catch (err) {
    console.warn(`[hotcinema] Warning: unexpected scraper failure (${err.message}).`);
    return [];
  }
}

export default scrapeHotCinema;
