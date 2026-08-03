/**
 * Run the full Cinema City scraping pipeline end-to-end:
 *
 *   node scrapers/cinemaCity.js        # 1. scrape the schedule → output.json
 *   node scrapers/enrichSeats.js       # 2. enrich with live seat metrics → output.seats.json
 *   node scrapers/uploadToSupabase.js  # 3. upload to Supabase
 *
 * Step 2 (seat enrichment) is optional via the `--skip-seats` flag:
 *   node scrapers/runAll.mjs --skip-seats
 *
 * Note: this is a wrapper that shells out to the individual scripts so each
 * one's documented behavior (progress logs, exit codes) is preserved.
 */
import { spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCRAPER = resolve(__dirname, 'cinemaCity.js');
const ENRICHER = resolve(__dirname, 'enrichSeats.js');
const UPLOADER = resolve(__dirname, 'uploadToSupabase.js');

const skipSeats = process.argv.includes('--skip-seats');

function run(script, label) {
  console.log(`\n━━━ ${label} ━━━\n`);
  const res = spawnSync(process.execPath, [script], { stdio: 'inherit', cwd: __dirname });
  if (res.status !== 0) {
    console.error(`❌ ${label} failed (exit code ${res.status}). Aborting pipeline.`);
    process.exit(res.status ?? 1);
  }
}

run(SCRAPER, 'STEP 1/3 — Scrape Cinema City schedule');
if (!skipSeats) {
  run(ENRICHER, 'STEP 2/3 — Enrich screenings with live seat metrics');
} else {
  console.log('\n⏭ Skipping seat enrichment (--skip-seats).');
}
run(UPLOADER, 'STEP 3/3 — Upload to Supabase');

console.log('\n🎉 Pipeline complete!');
process.exit(0);

