/**
 * Enrich scraped screenings with live seat metrics.
 *
 * Reads:    scrapers/output.json      (produced by scrapers/cinemaCity.js)
 * Writes:   scrapers/output.seats.json (same records + seat metrics)
 *
 * For each screening with a booking_url that contains an eventID, it opens
 * the Cinema City order page and parses the rendered seat-map SVG to extract:
 *   - total_rows       (number of rows in the hall)
 *   - total_seats      (total capacity)
 *   - available_seats  (currently available)
 *
 * The seat map is gated behind an invisible reCAPTCHA and may take a few
 * seconds to render; screenings that fail (timeout / no seat map) are kept
 * in the output with null seat metrics.
 *
 * Usage:
 *   node scrapers/cinemaCity.js        # 1. scrape schedule
 *   node scrapers/enrichSeats.js       # 2. enrich with live seat metrics
 *   node scrapers/uploadToSupabase.js  # 3. upload enriched data
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  createSession,
  fetchSeatDataForEvent,
  extractEventId,
} from './seatMap.js';

/** Extract the theaterId from a Cinema City booking URL (query param). */
function extractTheaterId(bookingUrl) {
  if (!bookingUrl) return null;
  try {
    const url = new URL(bookingUrl);
    return url.searchParams.get('theaterId') || null;
  } catch {
    return null;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const INPUT_FILE = resolve(__dirname, 'output.json');
const OUTPUT_FILE = resolve(__dirname, 'output.seats.json');

const MAX_SCREENINGS = Number(process.env.MAX_SCREENINGS || 0); // 0 = all
const CONCURRENCY = Number(process.env.SEAT_CONCURRENCY || 1); // pages per batch

async function main() {
  let screenings;
  try {
    screenings = JSON.parse(readFileSync(INPUT_FILE, 'utf-8'));
  } catch (err) {
    console.error(`❌ Could not read ${INPUT_FILE}:`, err.message);
    console.error('   Run `node scrapers/cinemaCity.js` first.');
    process.exit(1);
  }

  if (!Array.isArray(screenings) || screenings.length === 0) {
    console.error('❌ No screenings found in output.json.');
    process.exit(1);
  }

  const targets = MAX_SCREENINGS > 0 ? screenings.slice(0, MAX_SCREENINGS) : screenings;
  console.log(`🎟 Enriching ${targets.length} screenings (${screenings.length} total) with seat metrics...`);

  const { browser, page } = await createSession();

  const enriched = [];
  let ok = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const s = targets[i];
    const eventId = extractEventId(s.booking_url || s.bookingUrl);

    process.stdout.write(`   [${i + 1}/${targets.length}] ${s.movie_title} (event ${eventId ?? '?'})... `);

    if (!eventId) {
      enriched.push({ ...s, available_seats: null, total_seats: null, total_rows: null });
      console.log('⚠ no eventID — skipped');
      continue;
    }

    try {
      const theaterId = extractTheaterId(s.booking_url || s.bookingUrl);
      const seat = await fetchSeatDataForEvent(page, eventId, { theaterId });

      if (seat.totalSeats != null && seat.totalSeats > 0) {
        enriched.push({
          ...s,
          available_seats: seat.availableSeats,
          total_seats: seat.totalSeats,
          total_rows: seat.totalRows,
        });
        ok++;
        console.log(
          `✓ ${seat.totalSeats} seats / ${seat.totalRows} rows / ${seat.availableSeats} avail`
        );
      } else {
        enriched.push({ ...s, available_seats: null, total_seats: null, total_rows: null });
        failed++;
        console.log(`⚠ no seat map (reason: ${seat.reason ?? 'unknown'}, seatGroups=${seat.seatGroups})`);
      }
    } catch (err) {
      enriched.push({ ...s, available_seats: null, total_seats: null, total_rows: null });
      failed++;
      console.log(`✗ error: ${err.message}`);
    }
  }

  await browser.close();

  // Append any screenings beyond MAX_SCREENINGS unchanged (null seat metrics).
  if (MAX_SCREENINGS > 0 && MAX_SCREENINGS < screenings.length) {
    for (const s of screenings.slice(MAX_SCREENINGS)) {
      enriched.push({ ...s, available_seats: null, total_seats: null, total_rows: null });
    }
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(enriched, null, 2), 'utf-8');

  console.log('\n═══════════════════════════════════════════');
  console.log('✅ Enrichment complete!');
  console.log(`📁 Output: ${OUTPUT_FILE}`);
  console.log(`🎯 Enriched with seat data: ${ok}`);
  console.log(`⚠  No seat data (nulls):   ${failed}`);
  console.log('═══════════════════════════════════════════');

  if (ok > 0) {
    const first = enriched.find((e) => e.total_seats != null);
    if (first) {
      console.log('\n📋 Sample:');
      console.log(
        `   ${first.movie_title} | ${first.branch} | ${first.date_time} | ` +
          `seats=${first.total_seats} avail=${first.available_seats} rows=${first.total_rows}`
      );
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

