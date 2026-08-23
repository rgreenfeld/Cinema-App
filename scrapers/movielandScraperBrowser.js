/**
 * MovieLand (Israel) scraper — headless-browser variant.
 *
 * The plain `fetch()`-based scraper (movielandScraper.js) works reliably
 * from a residential/local IP but gets blocked (403 / anti-bot challenge)
 * when run from GitHub Actions' datacenter IP ranges.
 *
 * This variant uses Puppeteer, following the same pattern that already
 * works for cinemaCity.js in CI:
 *   1. Launch a real headless Chrome.
 *   2. Visit the MovieLand homepage first to pick up session cookies /
 *      pass any anti-bot JS challenge.
 *   3. Call the JSON API via `fetch()` executed *inside* the page context
 *      (page.evaluate), so requests use the browser's real TLS
 *      fingerprint, cookies and headers instead of Node's fetch.
 *
 * Reuses the branch list + JSON parsing logic from movielandScraper.js so
 * both scrapers stay in sync on output shape.
 */

import puppeteer from 'puppeteer';
import { BRANCHES, parseTheaterEvents } from './movielandScraper.js';

const BASE_URL = 'https://movieland.co.il';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function buildEventsUrl(theaterId) {
  const params = new URLSearchParams({
    TheatreId: String(theaterId),
    MovieId: '',
    Date: '',
    HebrewSubs: '',
    Dubbed: 'false',
    ThreeD: 'false',
    isVenueUpgrated: 'false',
    isHFR3D: 'false',
    isHideVODRent: 'true',
  });
  return `${BASE_URL}/api/Events?${params.toString()}`;
}

export async function scrapeMovielandBrowser() {
  console.log('🚀 Launching browser for MovieLand...');

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const dedup = new Map();

  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });

    // Visit the homepage once to establish session cookies / pass any
    // anti-bot challenge before hitting the JSON API.
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 1000));

    for (const branch of BRANCHES) {
      const url = buildEventsUrl(branch.theaterId);
      try {
        const movies = await page.evaluate(async (apiUrl) => {
          const res = await fetch(apiUrl, { headers: { Accept: 'application/json, text/plain, */*' } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        }, url);

        const screenings = parseTheaterEvents(movies, branch.name);
        for (const screening of screenings) {
          const key = `${branch.theaterId}:${screening._eventId}`;
          delete screening._eventId;
          dedup.set(key, screening);
        }
        console.log(`[movieland] ${branch.name}: ${screenings.length} screenings`);
      } catch (err) {
        console.warn(`[movieland] Warning: failed to fetch branch "${branch.name}" (${err.message}).`);
      }
    }
  } finally {
    await browser.close();
  }

  return Array.from(dedup.values()).sort((a, b) => a.date_time.localeCompare(b.date_time));
}

export default scrapeMovielandBrowser;
