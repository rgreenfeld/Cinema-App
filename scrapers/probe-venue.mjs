/**
 * Probes the order page to discover venue type data per event,
 * and checks for additional API endpoints that provide hall type / screen type info.
 */
import puppeteer from 'puppeteer';

const BASE_URL = 'https://www.cinema-city.co.il';

async function probe() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  // Listen for all network requests
  const requests = [];
  page.on('request', (req) => {
    if (req.url().includes('/tickets/') || req.url().includes('/api/') || req.url().includes('/get')) {
      requests.push({ url: req.url(), method: req.method() });
    }
  });

  const responses = [];
  page.on('response', async (res) => {
    if (res.url().includes('/tickets/') || res.url().includes('/api/') || res.url().includes('Venue') || res.url().includes('venue')) {
      try {
        const text = await res.text();
        responses.push({ url: res.url(), status: res.status(), text: text.slice(0, 1000) });
      } catch {}
    }
  });

  // Visit the order page for a specific event (Spider-Man at Glilot)
  console.log('Loading order page for event 814050...');
  await page.goto(`${BASE_URL}/order/?eventID=814050&theaterId=1170`, {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });
  await new Promise((r) => setTimeout(r, 3000));

  console.log(`\nNetwork requests captured: ${requests.length}`);
  requests.forEach((r) => console.log(`  ${r.method} ${r.url}`));

  console.log(`\nResponses captured: ${responses.length}`);
  responses.forEach((r) => {
    console.log(`\n  === ${r.url} (${r.status}) ===`);
    console.log(`  ${r.text.slice(0, 500)}`);
  });

  // Also try to extract venue type from the event data by fetching the order page
  // and looking for JavaScript variables
  const pageData = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script');
    const results = [];
    for (const script of scripts) {
      const text = script.textContent || '';
      // Look for venue type, showtime, or event data
      const relevantPatterns = ['venueType', 'VenueType', 'showTime', 'ShowTime', 'eventData', 'EventData',
        'screenType', 'ScreenType', 'hallType', 'HallType', 'venueTypes'];
      for (const pat of relevantPatterns) {
        if (text.includes(pat)) {
          results.push({ snippet: text.slice(Math.max(0, text.indexOf(pat) - 50), text.indexOf(pat) + 200) });
          break;
        }
      }
    }
    return results.slice(0, 10);
  });

  console.log('\n=== Page JS data about venue types ===');
  pageData.forEach((d) => console.log('  ', d.snippet));

  // Check for global ko observables
  const koData = await page.evaluate(() => {
    try {
      const app = window.__ko_app__ || window.koapp || window.app;
      return app ? 'App found' : 'No app reference';
    } catch { return 'Error'; }
  });
  console.log('\nKnockout app reference:', koData);

  await browser.close();
}

probe().catch(console.error);
