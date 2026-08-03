/**
 * Uploads scraped Cinema City screenings to Supabase — CLEANUP + FRESH SYNC.
 *
 * Reads:  scrapers/output.json (produced by scrapers/cinemaCity.js)
 * Writes: public.screenings table.
 *
 * Every run performs:
 *   1. Deletes OUTDATED (past) screenings from the screenings table — any row
 *      whose `date_time` is older than the current moment is removed.
 *   2. Inserts the fresh records from output.json in batches (500 rows/batch).
 *
 * This removes stale/past screenings while preserving upcoming ones, then
 * mirrors the latest scrape exactly.
 *
 * The scraper emits date_time values like "2026-08-05T23:30:00" (Israel
 * local wall time, no timezone suffix). This script normalizes those to
 * proper UTC ISO strings (e.g. "2026-08-05T20:30:00.000Z") before
 * inserting, so they satisfy Supabase's `timestamptz` column type.
 *
 * ─── language & screen_type mapping ──────────────────────────────────────
 * The scraper emits these fields already normalized:
 *   language    — 'מקור' (default), 'מדובב', 'רוסית', 'צרפתית', 'ערבית',
 *                 'אנגלית' (simple tags; dubbed-target languages collapse
 *                 to their language tag, e.g. 'מדובב לרוסית' → 'רוסית')
 *   screen_type — 'רגיל' (default), 'VIP', '4DX', 'IMAX', 'ScreenX', '3D',
 *                 'Onyx', 'קומפורט', ...
 * Every row is explicitly mapped with both fields:
 *   language: item.language || 'מקור'
 *   screen_type: item.screen_type || 'רגיל'
 *
 * ─── Permissions ─────────────────────────────────────────────────────────
 * Deleting outdated rows requires a key with DELETE privileges on the table — a
 * `service_role` key (bypasses RLS) or an anon key with a DELETE policy.
 *
 * IMPORTANT: if the key can INSERT but DELETE silently reports 0 rows, the
 * table has no DELETE policy (RLS). Add one in Supabase SQL Editor:
 *
 *   drop policy if exists "Allow anon delete" on public.screenings;
 *   create policy "Allow anon delete"
 *     on public.screenings
 *     for delete
 *     using (true);
 *
 * Environment variables (see .env / .env.example):
 *   SUPABASE_URL        — your Supabase project URL
 *   SUPABASE_ANON_KEY   — anon (or publishable) API key — used when a
 *                         service_role key is NOT set
 *   SUPABASE_SERVICE_ROLE_KEY — service_role key (bypasses RLS).
 *                         Prefer this for the scraper/uploader so both the
 *                         INSERT and DELETE steps always work.
 *   SUPABASE_SCREENINGS_TABLE — optional, defaults to "screenings"
 *
 * Usage: node scrapers/uploadToSupabase.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// If output.seats.json exists (from enrichSeats.js), prefer it so the DB gets
// live seat metrics (available_seats / total_seats / total_rows).
const INPUT_FILE = existsSync(resolve(__dirname, 'output.seats.json'))
  ? resolve(__dirname, 'output.seats.json')
  : resolve(__dirname, 'output.json');
const TABLE = process.env.SUPABASE_SCREENINGS_TABLE || 'screenings';
const BATCH_SIZE = 500;

// ─── Validate env ────────────────────────────────────────────────────────────

const url = process.env.SUPABASE_URL;
// Prefer the service_role key when present — it bypasses RLS, so both the
// INSERT and DELETE steps work regardless of table policies.
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const usingServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!url || !key) {
  console.error('❌ Missing Supabase credentials.');
  console.error('   Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in your .env file.');
  console.error('   See scrapers/.env.example');
  process.exit(1);
}

// ─── Read scraped data ────────────────────────────────────────────────────────

let screenings;
try {
  screenings = JSON.parse(readFileSync(INPUT_FILE, 'utf-8'));
} catch (err) {
  console.error(`❌ Could not read ${INPUT_FILE}:`, err.message);
  console.error('   Run `node scrapers/cinemaCity.js` first to generate the file.');
  process.exit(1);
}

if (!Array.isArray(screenings) || screenings.length === 0) {
  console.error('❌ No screenings found in output.json.');
  process.exit(1);
}

// ─── Date/time normalization helpers ───────────────────────────────────────────

/**
 * Convert an Israel-local wall-clock datetime to a proper UTC ISO string.
 *
 * The Cinema City site returns times as Israel local wall time with no
 * timezone suffix (e.g. "2026-08-05T23:30:00"). This computes the actual
 * Asia/Jerusalem UTC offset for that specific date (handles DST) and
 * produces a UTC ISO string (e.g. "2026-08-05T20:30:00.000Z").
 */
function israelLocalToUtc(dateTimeStr) {
  const m = dateTimeStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '00'] = m;

  // Treat the wall-clock value as if it were UTC, then see what that instant
  // looks like in Israel. The difference is Israel's offset at that date.
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

  // offsetMinutes = how far Israel is ahead of UTC at this date (180 in summer, 120 in winter)
  const offsetMinutes = (israelWallAsUTC - asUTC) / 60000;

  // Actual UTC instant = wall-clock time minus the offset
  return new Date(asUTC - offsetMinutes * 60000).toISOString();
}

/**
 * Normalize any accepted date_time representation into a valid UTC ISO string.
 *
 * Accepted forms:
 *   - "2026-08-05T23:30:00"            (Israel local, no timezone → converted to UTC)
 *   - "2026-08-05T23:30:00.000Z"       (already UTC)
 *   - "2026-08-05T23:30:00+03:00"      (already has explicit offset)
 *   - separate "date" + "startTime"    (legacy scraper format, handled by caller)
 */
function normalizeDateTime(value) {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;

  // Already has a timezone marker (Z or explicit offset) → valid ISO, keep as-is.
  if (/[zZ]$/.test(v) || /[+-]\d{2}:\d{2}$/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return null;
  }

  // Bare wall-clock datetime (no timezone) → treat as Israel local time.
  const isoLike = v.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/);
  if (isoLike) {
    return israelLocalToUtc(v);
  }

  // dd/MM/yyyy HH:mm (legacy API style) → convert to ISO then to UTC.
  const dmY = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (dmY) {
    const [, d, mo, y, h, mi] = dmY;
    const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}:00`;
    return israelLocalToUtc(iso);
  }

  return null;
}

// ─── Transform rows for Supabase ──────────────────────────────────────────────

/** Small field getter supporting both new snake_case and legacy camelCase keys. */
function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k];
  }
  return undefined;
}

const rows = screenings
  .map((s, i) => {
    // Normalize the date_time. Prefer the new combined `date_time` field,
    // but fall back to legacy separate `date` + `startTime` fields.
    let dateTime = normalizeDateTime(pick(s, 'date_time', 'dateTime'));

    if (!dateTime) {
      const date = pick(s, 'date');
      const startTime = pick(s, 'startTime', 'time');
      if (date && startTime) {
        dateTime = normalizeDateTime(`${date}T${startTime}`);
      }
    }

    if (!dateTime) {
      console.warn(`⚠ Skipping row ${i + 1} (missing/invalid date_time):`, JSON.stringify(s));
      return null;
    }

    const rawLanguage = pick(s, 'language', 'languageName');
    const language =
      typeof rawLanguage === 'string' && rawLanguage.trim() !== ''
        ? rawLanguage.trim()
        : 'מקור';

    const rawScreenType = pick(s, 'screen_type', 'screenType', 'hallType', 'venueType');
    const screen_type =
      typeof rawScreenType === 'string' && rawScreenType.trim() !== ''
        ? rawScreenType.trim()
        : 'רגיל';

    // Live seat metrics (from enrichSeats.js). Only include these columns in
    // the insert payload when a real numeric value exists — this keeps the
    // uploader compatible with databases that don't (yet) have the optional
    // seat columns while still uploading seat data when it's available.
    const availableSeats =
      typeof pick(s, 'available_seats', 'availableSeats') === 'number'
        ? pick(s, 'available_seats', 'availableSeats')
        : null;
    const totalSeats =
      typeof pick(s, 'total_seats', 'totalSeats') === 'number'
        ? pick(s, 'total_seats', 'totalSeats')
        : null;
    const totalRows =
      typeof pick(s, 'total_rows', 'totalRows') === 'number'
        ? pick(s, 'total_rows', 'totalRows')
        : null;

    const hasSeatData =
      availableSeats !== null || totalSeats !== null || totalRows !== null;

    return {
      movie_title: (pick(s, 'movie_title', 'movieTitle') || '').trim() || null,
      cinema_chain: pick(s, 'cinema_chain', 'cinemaChain') || 'Cinema City',
      branch: (pick(s, 'branch') || '').trim() || null,
      date_time: dateTime,
      booking_url: pick(s, 'booking_url', 'bookingUrl') || null,
      language,
      screen_type,
      // Optional seat metrics — spread only when present so the insert works
      // against schemas without these columns.
      ...(hasSeatData
        ? { available_seats: availableSeats, total_seats: totalSeats, total_rows: totalRows }
        : {}),
    };
  })
  .filter(Boolean);

if (rows.length === 0) {
  console.error('❌ No valid rows to upload.');
  process.exit(1);
}

// ─── Map fields with defaults ─────────────────────────────────────────────────
// Final pass to guarantee every row explicitly carries non-null values.
// language defaults to 'מקור', screen_type defaults to 'רגיל' when missing.

const cleanRows = rows.map((item) => ({
  ...item,
  language: item.language || 'מקור',
  screen_type: item.screen_type || 'רגיל',
}));

// ─── Upload (cleanup outdated + chunked insert) ───────────────────────────────

const supabase = createClient(url, key);

/** Split an array into fixed-size batches. */
function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

async function upload() {
  console.log(`🚀 Syncing ${cleanRows.length} screenings to Supabase table "${TABLE}"...`);
  console.log(`📅 Sample normalized date_time: ${cleanRows[0].date_time}`);
  console.log(`🔤 Sample language: ${cleanRows[0].language}`);
  console.log(`🖥 Sample screen_type: ${cleanRows[0].screen_type}`);
  console.log(`🔑 Using ${usingServiceRole ? 'service_role key (bypasses RLS)' : 'anon/publishable key (RLS applies)'}`);

  // ─── Step 1: Delete outdated (past) screenings ───────────────────────────
  const nowISO = new Date().toISOString();
  console.log(`🧹 Cleaning up screenings older than ${nowISO}...`);

  // Count rows that SHOULD be deleted so we can verify the delete actually
  // removed them. A silent "0 deleted while N outdated exist" is the classic
  // RLS missing-DELETE-policy signature.
  const { count: outdatedCount } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .lt('date_time', nowISO);
  console.log(`   Found ${outdatedCount ?? '?'} outdated screening(s).`);

  const { error: deleteError, count: deletedCount } = await supabase
    .from(TABLE)
    .delete({ count: 'exact' })
    .lt('date_time', nowISO); // timestamp column in the screenings table

  if (deleteError) {
    console.error('❌ Failed to delete outdated screenings:', deleteError.message);
    console.error('   Delete requires DELETE privileges — use a service_role key or add a DELETE policy.');
    process.exit(1);
  }

  if (deletedCount === 0 && outdatedCount > 0) {
    console.error('⚠️  DELETE ran but removed 0 rows even though outdated screenings exist.');
    console.error('   This means your key CANNOT delete rows (RLS has no DELETE policy).');
    console.error('   Fix: add the policy in Supabase SQL Editor:');
    console.error('     drop policy if exists "Allow anon delete" on public.screenings;');
    console.error('     create policy "Allow anon delete" on public.screenings for delete using (true);');
    console.error('   OR set SUPABASE_SERVICE_ROLE_KEY in your .env and re-run.');
    process.exit(1);
  }

  console.log(`   ✓ Outdated screenings cleaned (${deletedCount ?? 0} row(s) removed).`);

  // ─── Step 2: Insert fresh records in batches of 500 ──────────────────────
  const batches = chunk(cleanRows, BATCH_SIZE);
  let inserted = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const { error: insertError } = await supabase.from(TABLE).insert(batch);

    if (insertError) {
      console.error(`❌ Insert failed (batch ${i + 1}/${batches.length}):`, insertError.message);
      process.exit(1);
    }

    inserted += batch.length;
    console.log(`   ✓ Batch ${i + 1}/${batches.length} inserted (${batch.length} rows)`);
  }

  console.log(`✅ Sync complete — ${inserted} screenings in table "${TABLE}".`);

  // ─── Summary breakdown ───────────────────────────────────────────────────
  const langCounts = {};
  const screenCounts = {};
  for (const r of cleanRows) {
    langCounts[r.language] = (langCounts[r.language] || 0) + 1;
    screenCounts[r.screen_type] = (screenCounts[r.screen_type] || 0) + 1;
  }

  console.log('\n📊 Language breakdown:');
  for (const [lang, count] of Object.entries(langCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${lang}: ${count}`);
  }

  console.log('\n📊 Screen type breakdown:');
  for (const [st, count] of Object.entries(screenCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${st}: ${count}`);
  }

  console.log('\n📋 Preview of first inserted rows:');
  cleanRows.slice(0, 3).forEach((r, i) => {
    console.log(
      `   ${i + 1}. ${r.movie_title} | ${r.branch} | ${r.date_time} | ${r.language} | ${r.screen_type}`
    );
  });
}

upload();
