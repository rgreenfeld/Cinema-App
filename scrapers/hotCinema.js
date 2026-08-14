/**
 * Hot Cinema scraper runner.
 *
 * Produces a local output file compatible with uploadToSupabase.js.
 *
 * Usage:
 *   node scrapers/hotCinema.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { scrapeHotCinema } from './hotcinemaScraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_FILE = resolve(__dirname, 'output.hot.json');

async function run() {
  console.log('🚀 Starting Hot Cinema scraper...');

  const screenings = await scrapeHotCinema();
  if (!Array.isArray(screenings) || screenings.length === 0) {
    console.error('❌ Hot Cinema scraper returned no screenings.');
    process.exit(1);
  }

  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(screenings, null, 2), 'utf-8');

  console.log(`✅ Hot Cinema screenings saved: ${screenings.length}`);
  console.log(`📁 Output file: ${OUTPUT_FILE}`);
}

run().catch((err) => {
  console.error('❌ Hot Cinema scrape failed:', err.message);
  process.exit(1);
});
