/**
 * Probe: Intercept ALL API calls from the order page to find the seat data endpoint.
 */
import puppeteer from 'puppeteer';

const EVENT_ID = '838451';
const THEATER_ID = '1170';
const BASE_URL = 'https://www.cinema-city.co.il';
const ORDER_URL = `${BASE_URL}/order/?eventID=${EVENT_ID}&theaterId=${THEATER_ID}`;

async function probe() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });

  // Track ALL API/XHR/fetch calls
  const apiCalls = [];
  page.on('request', (request) => {
    const url = request.url();
    const type = request.resourceType();
    if (type === 'xhr' || type === 'fetch' || url.includes('api') || url.includes('tickets.')) {
      apiCalls.push({ url, method: request.method(), type, headers: request.headers() });
    }
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('api') || url.includes('tickets.')) {
      console.log('\n🔎 Response:', response.status(), url);
      try {
        const text = await response.text();
        console.log('  Body preview:', text.slice(0, 300));
      } catch (e) {
        console.log('  Could not read body:', e.message);
      }
    }
  });

  console.log('🌐 Visiting home page...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2000));

  // Dismiss GDPR banner
  await page.evaluate(() => {
    const btn = document.querySelector('.gdpr-accept-triger');
    if (btn) btn.click();
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));

  // Also visit tickets subdomain to establish cookies there
  console.log('🌐 Visiting tickets subdomain...');
  await page.goto(`https://tickets.cinema-city.co.il/order/${EVENT_ID}`, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2000));

  console.log('🌐 Navigating to order page...');
  apiCalls.length = 0; // clear
  await page.goto(ORDER_URL, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 5000));

  // Wait a bit more for lazy-loaded API calls
  await new Promise((r) => setTimeout(r, 5000));

  console.log('\n\n📊 All API calls from order page:');
  for (const call of apiCalls) {
    console.log(`  ${call.method} ${call.url}`);
  }

  // Try to get the Nuxt state after page has loaded
  const state = await page.evaluate(() => {
    try {
      const nuxt = window.__NUXT__;
      if (!nuxt) return 'No __NUXT__ found';
      
      const result = {};
      
      // Check if state was populated by the app
      if (nuxt.state && nuxt.state.booking) {
        const booking = nuxt.state.booking;
        for (const key of Object.keys(booking)) {
          if (key === 'Seats' || key === 'Phaser' || key === 'Presentations') {
            result[key] = JSON.stringify(booking[key]).slice(0, 500);
          }
        }
      }
      
      return result;
    } catch (e) {
      return 'Error: ' + e.message;
    }
  });

  console.log('\n📊 Nuxt state after page load:', state);

  await browser.close();
}

probe().catch(console.error);
