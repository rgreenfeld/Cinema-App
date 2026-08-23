/**
 * MovieLand scraper runner (headless-browser variant).
 *
 * Produces the same local output file as movieland.js, compatible with
 * uploadToSupabase.js, but fetches data via a real headless browser
 * (movielandScraperBrowser.js) to avoid anti-bot blocks seen on GitHub
 * Actions runners with the plain fetch()-based scraper.
 *
 * Usage:
 *   node scrapers/movielandBrowser.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { scrapeMovielandBrowser } from './movielandScraperBrowser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_FILE = resolve(__dirname, 'output.movieland.json');

async function run() {
  console.log('🚀 Starting MovieLand scraper (browser)...');

  const screenings = await scrapeMovielandBrowser();
  if (!Array.isArray(screenings) || screenings.length === 0) {
    console.error('❌ MovieLand scraper returned no screenings.');
    process.exit(1);
  }

  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(screenings, null, 2), 'utf-8');

  console.log(`✅ MovieLand screenings saved: ${screenings.length}`);
  console.log(`📁 Output file: ${OUTPUT_FILE}`);
}

run().catch((err) => {
  console.error('❌ MovieLand scrape failed:', err.message);
  process.exit(1);
});
