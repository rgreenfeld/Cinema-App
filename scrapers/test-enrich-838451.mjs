/**
 * Quick test: enrich the exact screening the user reported (event 838451)
 * using the improved seatMap.js module, to verify whether the www order-page
 * URL + enhanced reCAPTCHA handling now produce seat metrics.
 *
 * Usage: node scrapers/test-enrich-838451.mjs
 */
import { createSession, fetchSeatDataForEvent } from './seatMap.js';

const EVENT_ID = '838451';
const THEATER_ID = '1176'; // from the reported booking_url

async function main() {
  console.log(`🚀 Testing enrichment for event ${EVENT_ID} (theater ${THEATER_ID})...`);
  const { browser, page } = await createSession();
  try {
    const seat = await fetchSeatDataForEvent(page, EVENT_ID, {
      theaterId: THEATER_ID,
      attempts: 4,
      timeoutMs: 60000,
    });
    console.log('\n═══════════════════════════════════════════');
    console.log('📊 RESULT for event', EVENT_ID);
    console.log('═══════════════════════════════════════════');
    console.log('seatGroups:', seat.seatGroups);
    console.log('availableSeats:', seat.availableSeats);
    console.log('totalSeats:', seat.totalSeats);
    console.log('totalRows:', seat.totalRows);
    console.log('unavailable:', seat.unavailable);
    console.log('rows:', seat.rows?.join(', ') ?? '(none)');
    if (seat.reason) console.log('reason:', seat.reason);
    console.log('═══════════════════════════════════════════');
  } finally {
    await browser.close();
  }
  process.exit(0);
}

main().catch((err) => { console.error('❌ Fatal:', err); process.exit(1); });

