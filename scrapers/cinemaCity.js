/**
 * Cinema City (Israel) — Full Screening Schedule Scraper
 *
 * Fetches the complete upcoming schedule (all dates) for all Cinema City
 * branches from the site's internal tickets API.
 *
 * For each branch, the endpoint:
 *   GET /tickets/EventsFlat?TheatreId={theaterId}&VenueTypeId=0&MovieId=0&Date=0
 * returns a flat list of screenings, each with a movie name, VenueType
 * ("Vip" or ""), and a Dates object containing the showtime details.
 *
 * ─── Language ───────────────────────────────────────────────────────────
 * The payload does not expose an explicit language attribute, so language is
 * inferred from the movie title suffix patterns (checked most-specific first):
 *   - "-מדובב לרוסית"        → "רוסית" (Russian-dubbed)
 *   - "-מדובב לצרפתית"       → "צרפתית" (French-dubbed)
 *   - "-מדובב לערבית"        → "ערבית" (Arabic-dubbed)
 *   - "-מדובב"               → "מדובב" (Hebrew-dubbed)
 *   - "-מתורגם" / "-אנגלית"  → "אנגלית" (English / Hebrew-subtitled English)
 *   - default (no suffix)    → "מקור" (original language / unspecified)
 *
 * If the API ever returns explicit attributes (e.g. Language / Dubbed /
 * Subtitled / Attributes[]), extractLanguage() will prefer those and map
 * them to the same simple tag set above.
 *
 * ─── Screen type / hall type ─────────────────────────────────────────────
 * Screen type is extracted dynamically from VenueType and any format-related
 * attributes the API returns. Known values map to canonical labels:
 *   - "Vip" → "VIP"
 *   - "4DX" → "4DX", "IMAX" → "IMAX", "ScreenX" → "ScreenX",
 *   - "3D" → "3D", "Onyx" → "Onyx", "Comfort" → "קומפורט"
 * When no special hall/format is specified, screen_type defaults to "רגיל".
 *
 * Each extracted screening includes:
 *   - movie_title, branch, date_time, booking_url, cinema_chain
 *   - language, screen_type
 *
 * Output: JSON array saved to scrapers/output.json
 *
 * Usage:  node scrapers/cinemaCity.js
 */

import puppeteer from 'puppeteer';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Setup ──────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_URL = 'https://www.cinema-city.co.il';
const OUTPUT_FILE = resolve(__dirname, 'output.json');

// ─── Poster image CDN ──────────────────────────────────────────────────────────
// The EventsFlat payload exposes each movie's poster as a bare FILENAME in the
// `Pic` field (e.g. "גבעה 338.jpg"). The site serves these through the
// modulus.co.il image CDN, with the origin pointing at the media server:
//   https://cdn.modulus.co.il/fetch/cinemacity/{params}/http://80.178.112.171/images/{encoded-filename}
// The params below are the exact ones the tickets page uses for posters
// (236×350 poster crop, quality 95, verified to return HTTP 200 image/jpeg).
const POSTER_CDN_PREFIX =
  'https://cdn.modulus.co.il/fetch/cinemacity/w_236,h_350,mode_,quality_95,v_4f7026f8-2419-4c0e-a835-774fecc120bf41/http://80.178.112.171/images/';

/**
 * Build a full poster URL from the EventsFlat `Pic` field.
 * Returns null when the field is missing/empty so callers can store a
 * clean null (never a fake/placeholder image).
 */
function posterUrlFromPic(pic) {
  if (!pic) return null;
  const filename = String(pic).trim();
  if (!filename) return null;
  return `${POSTER_CDN_PREFIX}${encodeURIComponent(filename)}`;
}

const BRANCHES = [
  { name: 'סינמה סיטי גלילות',  theaterId: 1170 },
  { name: 'סינמה סיטי ראשל"צ',  theaterId: 1173 },
  { name: 'סינמה סיטי ירושלים', theaterId: 1174 },
  { name: 'סינמה סיטי כפר-סבא', theaterId: 1175 },
  { name: 'סינמה סיטי נתניה',   theaterId: 1176 },
  { name: 'סינמה סיטי חדרה',    theaterId: 1350 },
  { name: 'סינמה סיטי באר שבע', theaterId: 1178 },
  { name: 'סינמה סיטי אשדוד',   theaterId: 1181 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Convert "31/07/2026 22:00" to ISO "2026-07-31T22:00:00".
 */
function toISODateTime(ddMMyyyyHHmm) {
  if (!ddMMyyyyHHmm) return '';
  const m = ddMMyyyyHHmm.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return ddMMyyyyHHmm.trim();
  const [, d, mo, y, h, min] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${min}:00`;
}

/**
 * Normalize a language-related value from any payload attribute into a
 * simple canonical tag.
 *
 * Recognized tags (per the project convention):
 *   'מדובב'  — Hebrew-dubbed (no specific target language)
 *   'רוסית'  — Russian (incl. Russian-dubbed)
 *   'צרפתית' — French (incl. French-dubbed)
 *   'ערבית'  — Arabic (incl. Arabic-dubbed)
 *   'אנגלית' — English (incl. subtitled English / 'מתורגם')
 *
 * Accepts both Hebrew and English input. Returns '' for unrecognized
 * values so callers fall back to title inference / the 'מקור' default.
 */
function normalizeLanguageValue(raw) {
  if (!raw) return '';
  const v = String(raw).trim();
  if (!v) return '';

  const lower = v.toLowerCase();

  // Hebrew-dubbed with a specific target language → that language tag.
  if (v.includes('מדובב לרוסית') || (v.includes('מדובב') && (v.includes('רוסית') || /russian/i.test(lower)))) return 'רוסית';
  if (v.includes('מדובב לצרפתית') || (v.includes('מדובב') && (v.includes('צרפתית') || /french/i.test(lower)))) return 'צרפתית';
  if (v.includes('מדובב לערבית') || (v.includes('מדובב') && (v.includes('ערבית') || /arabic/i.test(lower)))) return 'ערבית';
  if (v.includes('מדובב') || /dubbed/i.test(lower)) return 'מדובב';

  // Hebrew-subtitled English / 'מתורגם' → English.
  if (v.includes('מתורגם') || /subtitl/i.test(lower)) return 'אנגלית';

  // Plain language tags.
  if (v.includes('אנגלית') || /english/i.test(lower)) return 'אנגלית';
  if (v.includes('רוסית') || /russian/i.test(lower)) return 'רוסית';
  if (v.includes('צרפתית') || /french/i.test(lower)) return 'צרפתית';
  if (v.includes('ערבית') || /arabic/i.test(lower)) return 'ערבית';

  // Hebrew is the local default — treat it as "original" for tagging.
  if (v.includes('עברית') || /hebrew/i.test(lower)) return 'מקור';

  // Unrecognized value → skip so callers fall back to title inference.
  return '';
}

/**
 * Extract language for a screening from the API payload.
 *
 * Preference order:
 *   1. Explicit attributes on the item or its Dates (Language, Dubbed,
 *      Subtitled, Attributes[] / LanguageName, etc.) — used only if present.
 *   2. Movie title suffix inference (most-specific pattern first).
 *
 * Returns a simple canonical tag: 'מקור' (default), 'אנגלית', 'מדובב',
 * 'רוסית', 'צרפתית', 'ערבית'.
 */
function extractLanguage(item, movieTitle) {
  const candidates = [];

  // Collect any attribute-like values from the item and its Dates object.
  const collect = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, val] of Object.entries(obj)) {
      const k = key.toLowerCase();
      const isLangAttr =
        k === 'language' ||
        k === 'languagename' ||
        k === 'dubbed' ||
        k === 'subtitles' ||
        k === 'subtitle' ||
        k === 'subtitled' ||
        (k.includes('language') && typeof val === 'string');
      if (isLangAttr && val !== null && val !== undefined && val !== '') {
        candidates.push(val);
      }
      if (Array.isArray(val)) {
        // Attributes array may contain { Name: 'מדובב' } / { Name: 'אנגלית' } etc.
        for (const entry of val) {
          if (entry && typeof entry === 'object') {
            const name = entry.Name || entry.name || entry.Value || entry.value;
            if (name) candidates.push(name);
          }
        }
      }
    }
  };
  collect(item);
  if (item && item.Dates) collect(item.Dates);

  for (const raw of candidates) {
    const normalized = normalizeLanguageValue(raw);
    if (normalized) return normalized;
  }

  // Fall back to title-suffix inference.
  return inferLanguage(movieTitle);
}

/**
 * Infer language from movie title suffix patterns.
 *
 * Order matters — check more specific patterns first. Uses includes()
 * (Hebrew-safe) rather than \b word boundaries, which do not match Hebrew.
 */
function inferLanguage(movieTitle) {
  const t = movieTitle || '';

  // Specific dubbed targets first (most-specific patterns first).
  if (t.includes('מדובב לרוסית')) return 'רוסית';
  if (t.includes('מדובב לצרפתית')) return 'צרפתית';
  if (t.includes('מדובב לערבית')) return 'ערבית';
  if (t.includes('מדובב')) return 'מדובב';

  // Hebrew-subtitled English ('מתורגם') / explicit English → English.
  if (t.includes('מתורגם')) return 'אנגלית';
  if (t.includes('אנגלית')) return 'אנגלית';

  // No dubbing/subtitle indicator → original language.
  return 'מקור';
}

/**
 * Map a VenueType / format value from the API to a canonical screen/hall type.
 *
 * Dynamically recognizes known premium/format halls:
 *   "Vip" → "VIP", "4DX" → "4DX", "IMAX" → "IMAX",
 *   "ScreenX" → "ScreenX", "3D" → "3D", "2D" → "2D",
 *   "Onyx" → "Onyx", "Comfort" → "קומפורט"
 *
 * Defaults to "רגיל" only when no special hall/format is specified.
 */
const SCREEN_TYPE_ALIASES = {
  vip: 'VIP',
  'לייט vip': 'לייט VIP',
  'late vip': 'לייט VIP',
  'latenight': 'LateNight',
  'late night': 'LateNight',
  prime: 'Prime',
  '4dx': '4DX',
  imax: 'IMAX',
  screenx: 'ScreenX',
  'screen x': 'ScreenX',
  '3d': '3D',
  '2d': '2D',
  onyx: 'Onyx',
  lounge: 'Lounge',
  comfort: 'קומפורט',
  קומפורט: 'קומפורט',
};

// Venue types per the site's ticketsNew2.js (VenueTypeId is the ONLY reliable
// signal for Onyx/Lounge — the EventsFlat response's VenueType field stays "").
// We query each venue type separately and tag the hall from the filter, since
// VenueTypeId=0 excludes Onyx/Lounge (and returns HTTP 500 for some branches).
const VENUE_TYPES = [
  { id: 1, label: 'רגיל' },      // regular halls
  { id: 3, label: 'VIP' },       // VIP
  { id: 8, label: 'Onyx' },      // ONYX (Glilot)
  { id: 201, label: 'Lounge' },  // Lounge (Glilot)
  { id: 7, label: 'LateNight' }, // late showings
  { id: 31, label: 'לייט VIP' }, // late VIP
];

function mapScreenType(venueType) {
  if (!venueType || String(venueType).trim() === '') return 'רגיל';
  const vt = String(venueType).trim();
  const key = vt.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(SCREEN_TYPE_ALIASES, key)) {
    return SCREEN_TYPE_ALIASES[key];
  }
  return vt;
}

/**
 * Extract the screen/hall type for a screening from the API payload.
 *
 * Preference order:
 *   1. VenueType on the item (e.g. "Vip") — primary source.
 *   2. Format/hall attributes on Dates or Attributes[] if present.
 *   3. Default "רגיל" when no special format is specified.
 */
function extractScreenType(item) {
  // Primary: item-level VenueType.
  const venueType = item && item.VenueType;

  const collect = (obj) => {
    const found = [];
    if (!obj || typeof obj !== 'object') return found;
    for (const [key, val] of Object.entries(obj)) {
      const k = key.toLowerCase();
      const isFormatAttr =
        k === 'venuetype' ||
        k === 'venuename' ||
        k === 'hallname' ||
        k === 'halltype' ||
        k === 'screentype' ||
        k === 'format' ||
        (k.includes('screen') && typeof val === 'string') ||
        (k.includes('hall') && typeof val === 'string');
      if (isFormatAttr && val !== null && val !== undefined && val !== '') {
        found.push(val);
      }
      if (Array.isArray(val)) {
        for (const entry of val) {
          if (entry && typeof entry === 'object') {
            const name = entry.Name || entry.name || entry.Value || entry.value;
            if (name) found.push(name);
          }
        }
      }
    }
    return found;
  };

  const candidates = [venueType];
  if (item && item.Dates) candidates.push(...collect(item.Dates));

  for (const raw of candidates) {
    if (raw === null || raw === undefined) continue;
    const mapped = mapScreenType(raw);
    if (mapped !== 'רגיל') return mapped;
  }

  return 'רגיל';
}

// ─── Scraper ────────────────────────────────────────────────────────────────────

async function scrapeCinemaCity() {
  console.log('🚀 Launching browser...');

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  const allScreenings = [];
  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });

  console.log(`🏢 Branches to scrape: ${BRANCHES.length}\n`);

  // Visit home page once to establish session cookies
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 45000 });

  // Dismiss GDPR banner if present
  await page.evaluate(() => {
    const btn = document.querySelector('.gdpr-accept-triger');
    if (btn) btn.click();
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));

  for (let i = 0; i < BRANCHES.length; i++) {
    const branch = BRANCHES[i];
    process.stdout.write(`   [${i + 1}/${BRANCHES.length}] ${branch.name}... `);

    try {
      // Query each venue type separately. The EventsFlat response's VenueType
      // field only ever returns ""/Vip/Prime — it NEVER marks Onyx/Lounge.
      // Those halls are identified ONLY by the VenueTypeId query filter, so we
      // loop over the venue types and tag the hall from the filter. This also
      // avoids the HTTP 500 that VenueTypeId=0 returns for some branches (e.g.
      // Jerusalem), and captures Onyx/Lounge at Glilot.
      // Dedups by eventID, preferring the most specific hall type.
      const seen = new Map(); // eventID -> best screening
      const addScreening = (item, venueLabel) => {
        const movieTitle = (item.Name || '').trim();
        if (!movieTitle) return;
        const d = item.Dates;
        if (!d) return;

        const eventId = d.EventId;
        const theaterId = d.TheaterId || branch.theaterId;
        const dateTime = toISODateTime(d.Date);
        if (!dateTime || !eventId) return;

        // Hall type from the query filter (authoritative for Onyx/Lounge),
        // or from the response's VenueType field (Vip/Prime) as a fallback,
        // or 'רגיל' when neither specifies a special hall.
        const fromFilter = venueLabel && venueLabel !== 'רגיל' ? venueLabel : null;
        const fromField = extractScreenType(item);
        const screen_type = fromFilter || fromField || 'רגיל';

        const screening = {
          movie_title: movieTitle,
          branch: branch.name,
          date_time: dateTime,
          booking_url: `${BASE_URL}/order/?eventID=${eventId}&theaterId=${theaterId}`,
          cinema_chain: 'Cinema City',
          language: extractLanguage(item, movieTitle),
          screen_type,
          // Real poster URL built from the EventsFlat `Pic` filename.
          // null when the payload doesn't carry one — never a placeholder.
          poster_url: posterUrlFromPic(item.Pic),
        };

        // Prefer the more specific hall type on collision.
        const existing = seen.get(eventId);
        const existingIsSpecial = existing && existing.screen_type !== 'רגיל';
        const newIsSpecial = screen_type !== 'רגיל';
        if (!existing || (newIsSpecial && !existingIsSpecial)) {
          seen.set(eventId, screening);
        }
      };

      // 1) Explicit venue-type queries (Ragil, VIP, Onyx, Lounge, LateNight, Late-VIP).
      for (const vt of VENUE_TYPES) {
        const data = await page.evaluate(async (theaterId, venueTypeId) => {
          const res = await fetch(
            `/tickets/EventsFlat?TheatreId=${theaterId}&VenueTypeId=${venueTypeId}&MovieId=0&Date=0`,
            { credentials: 'include' }
          );
          if (!res.ok) return null;
          return await res.json();
        }, branch.theaterId, vt.id);

        if (data && Array.isArray(data)) {
          for (const item of data) addScreening(item, vt.label);
        }
        await new Promise((r) => setTimeout(r, 300));
      }

      // 2) Fallback: the generic VenueTypeId=0 query (catches Prime & anything
      //    not covered by an explicit venue-type id). If it 500s (Jerusalem),
      //    that's fine — the explicit per-type queries above already capture it.
      const generic = await page.evaluate(async (theaterId) => {
        const res = await fetch(
          `/tickets/EventsFlat?TheatreId=${theaterId}&VenueTypeId=0&MovieId=0&Date=0`,
          { credentials: 'include' }
        );
        if (!res.ok) return null;
        return await res.json();
      }, branch.theaterId);

      if (generic && Array.isArray(generic)) {
        for (const item of generic) addScreening(item, null);
      }

      const screenings = [...seen.values()];
      allScreenings.push(...screenings);
      console.log(`✓ ${screenings.length} screenings`);
    } catch (err) {
      console.log(`✗ Error: ${err.message}`);
    }

    // Polite delay between branch requests
    await new Promise((r) => setTimeout(r, 1000));
  }

  await browser.close();

  // ─── Write output ────────────────────────────────────────────────────────

  const outDir = dirname(OUTPUT_FILE);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(allScreenings, null, 2), 'utf-8');

  // ─── Summary ──────────────────────────────────────────────────────────────

  const uniqueMovies = new Set(allScreenings.map((s) => s.movie_title));
  const uniqueBranches = new Set(allScreenings.map((s) => s.branch));
  const uniqueDates = new Set(allScreenings.map((s) => s.date_time.slice(0, 10)));
  const languages = new Set(allScreenings.map((s) => s.language));
  const screenTypes = new Set(allScreenings.map((s) => s.screen_type));

  console.log('\n═══════════════════════════════════════════');
  console.log(`✅ Scrape complete!`);
  console.log(`📁 Output: ${OUTPUT_FILE}`);
  console.log(`🎬 Total screenings: ${allScreenings.length}`);
  console.log(`🎥 Unique movies: ${uniqueMovies.size}`);
  console.log(`🏢 Branches with data: ${uniqueBranches.size}/${BRANCHES.length}`);
  console.log(`📅 Dates covered: ${uniqueDates.size}`);
  console.log(`🔤 Languages: ${[...languages].join(', ')}`);
  console.log(`🖥 Screen types: ${[...screenTypes].join(', ')}`);

  if (allScreenings.length > 0) {
    console.log('\n📋 Preview (first 5):');
    allScreenings.slice(0, 5).forEach((s, i) => {
      console.log(
        `   ${i + 1}. ${s.movie_title} | ${s.branch} | ${s.date_time} | ` +
        `${s.language} | ${s.screen_type}`
      );
    });
  }

  process.exit(0);
}

scrapeCinemaCity().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});

