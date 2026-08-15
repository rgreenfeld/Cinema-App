/**
 * Lev Cinema scraper runner.
 *
 * Produces a local output file compatible with uploadToSupabase.js.
 *
 * Usage:
 *   node scrapers/lev.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { scrapeLev } from './levScraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_FILE = resolve(__dirname, 'output.lev.json');

async function run() {
  console.log('🚀 Starting Lev Cinema scraper...');

  const screenings = await scrapeLev();
  if (!Array.isArray(screenings) || screenings.length === 0) {
    console.error('❌ Lev scraper returned no screenings.');
    process.exit(1);
  }

  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(screenings, null, 2), 'utf-8');

  console.log(`✅ Lev screenings saved: ${screenings.length}`);
  console.log(`📁 Output file: ${OUTPUT_FILE}`);
}

run().catch((err) => {
  console.error('❌ Lev scrape failed:', err.message);
  process.exit(1);
});
