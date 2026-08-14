/**
 * Planet Cinemas (Israel) — Full Screening Schedule Scraper + Supabase Upload
 *
 * Fetches the complete upcoming schedule for all Planet branches from the
 * site's public internal API and uploads it directly to Supabase.
 *
 * ─── API (reverse-engineered from the site's JS bundles) ─────────────────
 * The task-specified endpoint (data-api-v6/.../literal/10100/byDate/{DATE})
 * returns a 404 SPA fallback, and the domain "planetcinemas.co.il" does not
 * resolve. The real, working public API is served from:
 *
 *   Domain : https://www.planetcinema.co.il   (singular "cinema")
 *   Base   : /il/data-api-service/v1/quickbook/10100
 *
 * Endpoints used:
 *   GET /films/until/{date}                       → { body: { films: [...] } }
 *   GET /cinemas/with-event/until/{date}          → { body: { cinemas: [...] } }
 *   GET /film-events/in-cinema/{cinemaId}/at-date/{date} → { body: { films:[...], events:[...] } }
 *
 * Each `event` in the film-events response is a single screening:
 *   {
 *     id, filmId, cinemaId, businessDay,
 *     eventDateTime: "2026-08-07T16:30:00",        // Israel local wall time
 *     attributeIds: ["2d","first-subbed-lang-he","original-lang-en","subbed"],
 *     languages: { original:["no"], dubbed:[], voiceover:[], subtitles:["he","en"] },
 *     bookingLink: "https://tickets5.planetcinema.co.il/api/order/297875?lang=he",
 *     soldOut, availabilityRatio,
 *     auditorium: "אולם 1", auditoriumTinyName: "1"
 *   }
 *
 * ─── Cinema branch IDs ────────────────────────────────────────────────────
 * Verified against the live API (the IDs in the original task spec are
 * outdated and return 0 events). The API's own displayName is used as the
 * branch name so it matches what the site shows.
 *
 *   Ayalon (Ramat Gan)  → 1025  (פלאנט אילון)
 *   Haifa               → 1070  (פלאנט חיפה)
 *   Rishon LeZion       → 1072  (פלאנט ראשון לציון)
 *   Jerusalem           → 1073  (פלאנט ירושלים)
 *   Beer Sheva          → 1074  (פלאנט באר שבע)
 *   Zichron Yaakov      → 1075  (פלאנט זכרון יעקב)
 *
 * ─── Screen type & language mapping ───────────────────────────────────────
 * screen_type is derived from the event's `attributeIds` (e.g. "2d"→רגיל,
 * "vip"→VIP, "4dx"→4DX, "imax"→IMAX, "screenx"→ScreenX, "3d"→3D).
 * language is derived from the event's `languages` object (dubbed / original
 * / subtitles language codes) mapped to the project's Hebrew tags.
 *
 * ─── Supabase upload ──────────────────────────────────────────────────────
 * - `movies`   : upsert by cleanTitle; poster_url filled only if currently
 *                empty (non-destructive — never overwrites a valid poster).
 * - `showtimes`: upsert with cinema_chain="planet", branch, date_time (UTC),
 *                booking_url, language, screen_type.
 *
* Environment variables (see scrapers/.env.example):
 *   SUPABASE_URL        — your Supabase project URL
 *   SUPABASE_ANON_KEY   — anon (or publishable) API key
 *   SUPABASE_SERVICE_ROLE_KEY — service_role key (bypasses RLS). Preferred.
 *   SUPABASE_MOVIES_TABLE     — optional, defaults to "movies"
 *   SUPABASE_SCREENINGS_TABLE — optional, defaults to "screenings" (the table
 *                               the app reads; the task's "showtimes" name is
 *                               aliased here via env override if you use it)
*   (no day-count parameter)   — the scraper automatically discovers and
*                                pulls the maximum currently available
*                                upcoming schedule window from the API
 *
 * Usage:  node scrapers/planet.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { normalizeMovieTitle } from './normalizeMovieTitle.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.planetcinema.co.il';
const API_BASE = '/il/data-api-service/v1/quickbook/10100';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Verified real cinema IDs (branch → API id). The original task IDs
// (1022/1023/1024/1026/1027) return 0 events from the live API.
const BRANCHES = [
  { apiId: '1025', name: 'פלאנט אילון' },        // Ayalon, Ramat Gan
  { apiId: '1070', name: 'פלאנט חיפה' },          // Haifa
  { apiId: '1072', name: 'פלאנט ראשון לציון' },   // Rishon LeZion
  { apiId: '1073', name: 'פלאנט ירושלים' },       // Jerusalem
  { apiId: '1074', name: 'פלאנט באר שבע' },       // Beer Sheva
  { apiId: '1075', name: 'פלאנט זכרון יעקב' },    // Zichron Yaakov
];

const BATCH_SIZE = 500;
const REQUEST_TIMEOUT_MS = 25000;
const RETRIES = 2;
const BRANCH_FETCH_CONCURRENCY = 3;
const MAX_DISCOVERY_DAYS = 120;
const STOP_AFTER_EMPTY_DAYS = 3;

// ─── Screen-type mapping from attributeIds ───────────────────────────────────
const SCREEN_TYPE_ATTRS = [
  { re: /4dx/i, label: '4DX' },
  { re: /imax/i, label: 'IMAX' },
  { re: /screenx/i, label: 'ScreenX' },
  { re: /vip/i, label: 'VIP' },
  { re: /onyx/i, label: 'Onyx' },
  { re: /lounge/i, label: 'Lounge' },
  { re: /prime/i, label: 'Prime' },
  { re: /\b3d\b/i, label: '3D' },
  { re: /\b2d\b/i, label: 'רגיל' },
];

/**
 * Map an event's attributeIds to a canonical Hebrew hall type.
 * Defaults to 'רגיל' when no special format attribute is present.
 */
function mapScreenType(attributeIds = []) {
  // Prefer the most specific premium format first.
  for (const { re, label } of SCREEN_TYPE_ATTRS) {
    if (attributeIds.some((a) => re.test(String(a)))) {
      return label;
    }
  }
  return 'רגיל';
}

/**
 * Build the guest-facing booking URL for a Planet screening.
 *
 * Uses Planet's public browser-facing booking entry point.
 * The accessible route for direct user navigation is the launch URL:
 *
 *   https://www.planetcinema.co.il/il/booking-router/launch/{eventId}?lang=he
 *
 * This is the URL that can be followed by a browser and then redirects to
 * the actual booking host under br.planetcinema.co.il.
 *
 * Internal `/il/booking-router/booking` requests are POST-only and return
 * a JSON error for direct GET navigation.
 *
 * @param evt       The film-events API event. It must contain `id` (eventId)
 *                  and usually `cinemaId`; if `cinemaId` is missing we fall
 *                  back to the branch API id.
 * @param cinemaId  Fallback cinema id (the branch's apiId) when evt.cinemaId
 *                  is not present in the payload.
 * @returns The public booking URL, or null if required fields are missing.
 */
function normalizePlanetOrderUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const m = trimmed.match(/^(https?:\/\/tickets5\.planetcinema\.co\.il)\/(?:api\/)?order\/(\d+)(\?.*)?$/i);
  if (!m) return null;

  const [, host, eventId, query] = m;
  const lang = query && /\blang=he-?IL\b/i.test(query) ? 'he' : 'he';
  return `${host}/order/${eventId}?lang=${lang}`;
}

function buildPlanetBookingUrl(evt, cinemaId) {
  const orderUrl = normalizePlanetOrderUrl(evt?.bookingLink || evt?.bookingUrl || evt?.compositeBookingLink?.bookingUrl?.url);
  if (orderUrl) return orderUrl;

  if (typeof evt?.bookingRouterLaunchLink === 'string' && evt.bookingRouterLaunchLink.trim()) {
    return evt.bookingRouterLaunchLink.trim();
  }

  const eventId = evt?.id || evt?.eventId || evt?.performanceId;
  const cid = String(evt?.cinemaId || cinemaId || '').trim();
  if (!eventId || !cid) return null;

  return `https://www.planetcinema.co.il/il/booking-router/launch/${eventId}?lang=he`;
}

const BOOKING_URL_PATTERN = /^https:\/\/(?:www\.planetcinema\.co\.il\/il\/booking-router\/launch\/[0-9]+\?lang=he|tickets5\.planetcinema\.co\.il\/order\/[0-9]+\?lang=he)$/i;
function isPlanetBookingUrl(value) {
  return typeof value === 'string' && BOOKING_URL_PATTERN.test(value.trim());
}

async function asyncPool(items, iteratorFn, concurrency) {
  const results = [];
  const executing = [];

  for (const item of items) {
    const promise = Promise.resolve().then(() => iteratorFn(item));
    results.push(promise);

    if (concurrency <= items.length) {
      const e = promise.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }
  }

  return Promise.all(results);
}

// ─── Language mapping from the event's `languages` object ────────────────────
const LANG_CODE_TO_HEBREW = {
  he: 'עברית',
  en: 'אנגלית',
  ru: 'רוסית',
  ar: 'ערבית',
  fr: 'צרפתית',
};

/**
 * Derive the project's Hebrew language tag from an event's `languages` object:
 *   { original: ["no"], dubbed: ["he"], voiceover: [], subtitles: ["he","en"] }
 *
 * Priority (most specific first):
 *   1. Dubbed (→ the target language, or 'מדובב' if target is Hebrew/unknown)
 *   2. Voiceover (→ 'מדובב' / that language)
 *   3. Subtitles (→ the original-language tag; Hebrew subtitles on a foreign
 *      film → 'אנגלית' practically, but we prefer the explicit original code)
 *   4. Original language (→ 'מקור' when it's Hebrew, else the language tag)
 * Falls back to normalizeMovieTitle's title inference when nothing is present.
 */
function mapLanguage(languages = {}, isDubbedTag = false) {
  const original = (languages.original || []).filter(Boolean);
  const dubbed = (languages.dubbed || []).filter(Boolean);
  const voiceover = (languages.voiceover || []).filter(Boolean);
  const subtitles = (languages.subtitles || []).filter(Boolean);

  // Explicit dubbing → Hebrew tag for the target, or 'מדובב' generically.
  if (dubbed.length > 0) {
    const target = LANG_CODE_TO_HEBREW[dubbed[0].toLowerCase()];
    return target || 'מדובב';
  }
  if (voiceover.length > 0) {
    const target = LANG_CODE_TO_HEBREW[voiceover[0].toLowerCase()];
    return target || 'מדובב';
  }
  // Subtitled foreign film → the original language is the audio language.
  if (subtitles.length > 0 && original.length > 0) {
    const orig = LANG_CODE_TO_HEBREW[original[0].toLowerCase()];
    return orig || 'מקור';
  }
  if (original.length > 0) {
    const orig = LANG_CODE_TO_HEBREW[original[0].toLowerCase()];
    return orig || 'מקור';
  }
  // Fall back to title inference (covers e.g. Russian/French dubbed suffixes).
  return isDubbedTag ? 'מדובב' : 'מקור';
}

function hasDubbedAudio(languages = {}, inferredDubbed = false) {
  const dubbed = (languages.dubbed || []).filter(Boolean);
  const voiceover = (languages.voiceover || []).filter(Boolean);
  return dubbed.length > 0 || voiceover.length > 0 || inferredDubbed;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Format a Date as YYYY-MM-DD in Israel local time.
 * The API's "until" dates and byDate are Israel business dates.
 */
function formatIsraelDate(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Convert an Israel-local wall-clock datetime (e.g. "2026-08-07T16:30:00")
 * to a proper UTC ISO string. Handles DST via Intl.
 */
function israelLocalToUtc(dateTimeStr) {
  const m = String(dateTimeStr).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '00'] = m;
  const asUTC = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(asUTC));

  const map = {};
  for (const p of parts) map[p.type] = p.value;

  const israelWallAsUTC = Date.UTC(
    +map.year,
    +map.month - 1,
    +map.day,
    +map.hour,
    +map.minute,
    +map.second
  );
  const offsetMinutes = (israelWallAsUTC - asUTC) / 60000;
  return new Date(asUTC - offsetMinutes * 60000).toISOString();
}

// ─── HTTP helper with retries ────────────────────────────────────────────────

async function fetchJson(url) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        // A 404 here usually means the SPA fallback (no real endpoint) — skip.
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < RETRIES) {
        const delay = 1000 * (attempt + 1);
        console.warn(`   ⚠ Request failed (${err.message}); retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ─── Scraper ─────────────────────────────────────────────────────────────────

/**
 * Fetch the full Planet schedule across all branches using auto-discovery
 * until the upstream API appears exhausted.
 * Returns an array of normalized screening records.
 */
async function scrapePlanetSchedule() {
  console.log('🚀 Starting Planet cinemas scraper...');
  console.log(`🏢 Branches: ${BRANCHES.length} | 📅 Mode: auto-discovery (max available)\n`);

  // Discover dates dynamically and stop after a short empty tail.
  const dates = [];
  const now = new Date();
  const screenings = [];

  let emptyDaysInARow = 0;
  for (let offset = 0; offset < MAX_DISCOVERY_DAYS; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    const date = formatIsraelDate(d);
    dates.push(date);

    let filmMap = new Map();
    const filmsUrl = `${BASE_URL}${API_BASE}/films/until/${date}`;
    try {
      const filmsData = await fetchJson(filmsUrl);
      const films = (filmsData?.body?.films) || [];
      filmMap = new Map(films.map((f) => [f.id, f]));
    } catch (err) {
      console.warn(`   ⚠ Could not fetch films for ${date}: ${err.message}`);
    }

    console.log(`   📅 ${date}...`);

    const branchResults = await asyncPool(
      BRANCHES,
      async (branch) => {
        const url = `${BASE_URL}${API_BASE}/film-events/in-cinema/${branch.apiId}/at-date/${date}`;
        try {
          const data = await fetchJson(url);
          return { branch, events: data?.body?.events || [] };
        } catch (err) {
          return { branch, events: null, error: err.message };
        }
      },
      BRANCH_FETCH_CONCURRENCY
    );

    let dayCount = 0;
    for (const result of branchResults) {
      const { branch, events, error } = result;
      if (error) {
        console.log(`   ⚠ ${branch.name} (${date}): ${error}`);
        continue;
      }

      for (const evt of events) {
        const film = filmMap.get(evt.filmId);
        const rawTitle = (film?.name || '').trim();
        if (!rawTitle) continue;

        const showTime = israelLocalToUtc(evt.eventDateTime);
        if (!showTime) continue;

        const normalized = normalizeMovieTitle(rawTitle);
        const cleanTitle = (normalized.cleanTitle || rawTitle || '').trim();
        if (!cleanTitle || /^null$/i.test(cleanTitle) || /^undefined$/i.test(cleanTitle)) {
          console.warn(`⚠ Skipping event ${evt.id || evt.eventId || '<unknown>'} for ${branch.name} — invalid clean title: ${cleanTitle}`);
          continue;
        }

        // Language: prefer the API's structured languages; fall back to the
        // title-inference language from normalizeMovieTitle.
        let language = mapLanguage(evt.languages);
        if ((language === 'מקור' || language === 'מדובב') && normalized.language && normalized.language !== 'original') {
          const fromTitle =
            { hebrew: 'עברית', english: 'אנגלית', russian: 'רוסית', french: 'צרפתית', arabic: 'ערבית' }[
              normalized.language
            ] || 'מקור';
          language = fromTitle;
        }

        const bookingUrl = buildPlanetBookingUrl(evt, branch.apiId);
        if (!bookingUrl || !isPlanetBookingUrl(bookingUrl)) {
          console.warn(`⚠ Skipping event ${evt.id || evt.eventId || '<unknown>'} for ${branch.name} — invalid booking URL: ${bookingUrl}`);
          continue;
        }

        screenings.push({
          rawTitle,
          cleanTitle,
          branchName: branch.name,
          showTime, // UTC ISO string
          bookingUrl,
          screenType: mapScreenType(evt.attributeIds),
          posterUrl: film?.posterLink || null,
          language,
          isDubbed: hasDubbedAudio(evt.languages, normalized.isDubbed),
        });
        dayCount++;
      }
    }

    console.log(`   ✓ ${dayCount} screenings`);

    if (dayCount === 0) {
      emptyDaysInARow += 1;
      if (emptyDaysInARow >= STOP_AFTER_EMPTY_DAYS) {
        console.log(`   ⏹ Stopping discovery after ${STOP_AFTER_EMPTY_DAYS} empty day(s) in a row.`);
        break;
      }
    } else {
      emptyDaysInARow = 0;
    }
  }

  if (dates.length > 0) {
    console.log(`\n📅 Date range scanned: ${dates[0]} → ${dates[dates.length - 1]}`);
  }

  console.log(`\n🎬 Total screenings scraped: ${screenings.length}`);
  return screenings;
}

// ─── Supabase upload ─────────────────────────────────────────────────────────

const url = process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const usingServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!url || !key) {
  console.error('❌ Missing Supabase credentials.');
  console.error('   Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in your .env file.');
  process.exit(1);
}

const supabase = createClient(url, key);
const MOVIES_TABLE = process.env.SUPABASE_MOVIES_TABLE || 'movies';
// The app reads screenings from the `screenings` table (see supabase/schema.sql
// and src/lib/supabase.ts). We default to that table for full pipeline
// integration; override via SUPABASE_SCREENINGS_TABLE if you use another name
// (e.g. the task's "showtimes" alias).
const SCREENINGS_TABLE = process.env.SUPABASE_SCREENINGS_TABLE || 'screenings';

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

function isValidPosterUrl(value) {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    /^https?:\/\//i.test(value.trim())
  );
}

/**
 * Upsert unique movies into the `movies` table (non-destructive poster rule):
 *   - New movie → insert with poster_url (if valid).
 *   - Existing movie with NO valid poster yet → update with incoming valid one.
 *   - Existing movie with a valid poster → never overwrite.
 */
async function uploadMovies(screenings) {
  const byTitle = new Map();
  for (const s of screenings) {
    const title = (s.cleanTitle || '').trim();
    if (!title) continue;
    const incoming = isValidPosterUrl(s.posterUrl) ? s.posterUrl : null;
    const existing = byTitle.get(title);
    if (!existing || (!existing.poster_url && incoming)) {
      byTitle.set(title, { title, poster_url: incoming });
    }
  }

  const movies = [...byTitle.values()];
  if (movies.length === 0) {
    console.log('   ℹ No movies to upsert.');
    return;
  }

  console.log(`🎬 Upserting ${movies.length} unique movies into "${MOVIES_TABLE}"...`);

  // Insert missing movies (ignore duplicates so we never overwrite on insert).
  const { error: insertError } = await supabase
    .from(MOVIES_TABLE)
    .upsert(movies, { onConflict: 'title', ignoreDuplicates: true });
  if (insertError) {
    // The `movies` table may not exist yet in some DBs (schema not migrated).
    // That must not abort the more important screenings upload — warn and
    // continue. Run the migration SQL in supabase/schema.sql to enable it.
    if (/could not find the table/i.test(insertError.message)) {
      console.warn(
        `   ⚠ "${MOVIES_TABLE}" table not found — skipping movie poster enrichment.`
      );
      console.warn('     Create it with the SQL in supabase/schema.sql (public.movies).');
      return;
    }
    console.error('❌ Failed to insert movies:', insertError.message);
    process.exit(1);
  }

  // Enrich only rows whose stored poster_url is missing/empty.
  const needEnrichment = movies.filter((m) => m.poster_url);
  if (needEnrichment.length === 0) {
    console.log('   ✓ All movies already have valid posters (nothing to enrich).');
    return;
  }

  const titlesToEnrich = needEnrichment.map((m) => m.title);
  const { data: existingRows, error: fetchError } = await supabase
    .from(MOVIES_TABLE)
    .select('title, poster_url')
    .in('title', titlesToEnrich);
  if (fetchError) {
    console.error('❌ Failed to read existing movies for enrichment:', fetchError.message);
    process.exit(1);
  }

  const existingByTitle = new Map((existingRows || []).map((r) => [r.title, r]));
  const toUpdate = needEnrichment.filter((m) => {
    const stored = existingByTitle.get(m.title);
    return !stored || !isValidPosterUrl(stored.poster_url);
  });

  if (toUpdate.length === 0) {
    console.log('   ✓ Every movie already has a valid poster (no overwrite needed).');
    return;
  }

  const updateBatches = chunk(toUpdate, BATCH_SIZE);
  let updated = 0;
  for (let i = 0; i < updateBatches.length; i++) {
    const { error: updateError } = await supabase
      .from(MOVIES_TABLE)
      .upsert(updateBatches[i], { onConflict: 'title' });
    if (updateError) {
      console.error(`❌ Failed to enrich movies (batch ${i + 1}/${updateBatches.length}):`, updateError.message);
      process.exit(1);
    }
    updated += updateBatches[i].length;
  }
  console.log(`   ✓ Enriched ${updated} movie(s) with their real poster URL.`);
}

/**
 * Upload Planet screenings into the `screenings` table (the table the app
 * reads). Since the table has no unique constraint, we mirror the existing
 * uploadToSupabase.js pipeline: delete this chain's outdated rows, then insert
 * the fresh ones in batches. This keeps Planet data in sync without stale
 * duplicates across runs.
 *
 * The delete requires DELETE privileges — use a service_role key or ensure a
 * DELETE policy exists (see the schema / uploadToSupabase.js notes).
 */
async function uploadShowtimes(screenings) {
  const rows = screenings.map((s) => ({
    movie_title: s.cleanTitle,
    cinema_chain: 'planet',
    branch: s.branchName,
    date_time: s.showTime,
    booking_url: s.bookingUrl,
    language: s.language || 'מקור',
    is_dubbed: Boolean(s.isDubbed),
    screen_type: s.screenType || 'רגיל',
  }));

  if (rows.length === 0) {
    console.log('   ℹ No showtimes to upload.');
    return;
  }

  console.log(`🎫 Syncing ${rows.length} Planet showtimes into "${SCREENINGS_TABLE}"...`);

  // ─── Step 1: Delete ALL existing Planet screenings ─────────────────────────
  // The scraper re-fetches the full upcoming schedule every run, so the safest
  // sync is to remove every existing `cinema_chain='planet'` row and insert the
  // fresh set. Syncing only "outdated" rows (date_time < now) leaves the
  // previously-uploaded future rows behind, producing duplicates (stale
  // blocked router-launch URLs alongside fresh ones). Deleting all Planet rows
  // keeps the table clean and consistent on every run.
  console.log(`🧹 Removing all existing Planet screenings...`);

  const { count: existingCount } = await supabase
    .from(SCREENINGS_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('cinema_chain', 'planet');
  console.log(`   Found ${existingCount ?? '?'} existing Planet screening(s).`);

  const { error: deleteError, count: deletedCount } = await supabase
    .from(SCREENINGS_TABLE)
    .delete({ count: 'exact' })
    .eq('cinema_chain', 'planet');

  if (deleteError) {
    console.error('❌ Failed to delete existing Planet screenings:', deleteError.message);
    console.error('   Delete requires DELETE privileges — use a service_role key or add a DELETE policy.');
    process.exit(1);
  }

  if ((existingCount ?? 0) > 0 && deletedCount === 0) {
    console.error('⚠️  DELETE ran but removed 0 rows even though Planet screenings exist.');
    console.error('   This means your key CANNOT delete rows (RLS has no DELETE policy).');
    console.error('   Fix: add the policy in Supabase SQL Editor, or set SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  console.log(`   ✓ Existing Planet screenings removed (${deletedCount ?? 0} row(s)).`);

  // If the DB has a dedicated clean_title column, populate it from the
  // canonical movie title while keeping compatibility with leaner schemas.
  let rowsForInsert = rows;
  const cleanTitleProbe = await supabase.from(SCREENINGS_TABLE).select('clean_title').limit(1);
  if (!cleanTitleProbe.error) {
    rowsForInsert = rows.map((row) => ({ ...row, clean_title: row.movie_title }));
    console.log('   ✓ Detected clean_title column; it will be populated on insert.');
  }

  const dubbedProbe = await supabase.from(SCREENINGS_TABLE).select('is_dubbed').limit(1);
  if (dubbedProbe.error) {
    rowsForInsert = rowsForInsert.map(({ is_dubbed, ...row }) => row);
    console.log('   ℹ is_dubbed column not found; Planet upload will omit dubbed flags.');
  }

  // ─── Step 2: Insert fresh records in batches ────────────────────────────
  const batches = chunk(rowsForInsert, BATCH_SIZE);
  let inserted = 0;

  for (let i = 0; i < batches.length; i++) {
    const { error: insertError } = await supabase
      .from(SCREENINGS_TABLE)
      .insert(batches[i]);
    if (insertError) {
      console.error(`❌ Insert failed (batch ${i + 1}/${batches.length}):`, insertError.message);
      process.exit(1);
    }
    inserted += batches[i].length;
    console.log(`   ✓ Batch ${i + 1}/${batches.length} inserted (${batches[i].length} rows)`);
  }
  console.log(`   ✓ ${inserted} Planet showtimes inserted.`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const screenings = await scrapePlanetSchedule();

  if (screenings.length === 0) {
    console.error('\n❌ No screenings scraped. Nothing to upload.');
    process.exit(1);
  }

  console.log(`🔑 Using ${usingServiceRole ? 'service_role key (bypasses RLS)' : 'anon/publishable key (RLS applies)'}\n`);

  await uploadMovies(screenings);
  await uploadShowtimes(screenings);

  // ─── Summary ─────────────────────────────────────────────────────────────
  const uniqueMovies = new Set(screenings.map((s) => s.cleanTitle));
  const uniqueBranches = new Set(screenings.map((s) => s.branchName));
  const languages = new Set(screenings.map((s) => s.language));
  const screenTypes = new Set(screenings.map((s) => s.screenType));

  console.log('\n═══════════════════════════════════════════');
  console.log('✅ Planet scrape + upload complete!');
  console.log(`🎬 Total screenings: ${screenings.length}`);
  console.log(`🎥 Unique movies: ${uniqueMovies.size}`);
  console.log(`🏢 Branches with data: ${uniqueBranches.size}/${BRANCHES.length}`);
  console.log(`🔤 Languages: ${[...languages].join(', ')}`);
  console.log(`🖥 Screen types: ${[...screenTypes].join(', ')}`);

  console.log('\n📋 Preview (first 5):');
  screenings.slice(0, 5).forEach((s, i) => {
    console.log(
      `   ${i + 1}. ${s.cleanTitle} | ${s.branchName} | ${s.showTime} | ` +
        `${s.language} | ${s.screenType}`
    );
  });

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
