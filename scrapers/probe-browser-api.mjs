/**
 * Probe: Call seats-statusV2 from WITHIN a real browser session.
 *
 * Establishes a session on the home page, navigates to the order page,
 * then manually calls the seats API from page context (same as the site's
 * own JS does) and logs the exact status + body. This tells us whether the
 * API requires a reCAPTCHA-validated in-browser session, and what a
 * successful response looks like.
 *
 * Usage: node scrapers/probe-browser-api.mjs
 */
import puppeteer from 'puppeteer';

const EVENT_ID = '838451';
const THEATER_ID = '1170';
const BASE_URL = 'https://www.cinema-city.co.il';
const ORDER_URL = `${BASE_URL}/order/?eventID=${EVENT_ID}&theaterId=${THEATER_ID}`;

async function probe() {
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  // Intercept ALL requests to the seats API
  const apiLog = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('seats-statusV2')) {
      const entry = { url, status: response.status() };
      try {
        const ct = response.headers()['content-type'] || '';
        if (ct.includes('json')) {
          entry.body = await response.json();
        } else {
          entry.text = (await response.text()).slice(0, 300);
        }
      } catch (e) {
        entry.error = e.message;
      }
      apiLog.push(entry);
      console.log('\n🔎 Intercepted:', response.status(), url.split('?')[0]);
    }
  });

  // Step 1: home page → session cookies
  console.log('🌐 Visiting home page...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2000));
  await page.evaluate(() => {
    const btn = document.querySelector('.gdpr-accept-triger');
    if (btn) btn.click();
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));

  // Step 2: order page
  console.log('🌐 Visiting order page...');
  await page.goto(ORDER_URL, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 5000));

  // Step 3: manually call the API from page context (mirrors the site's own JS)
  console.log('\n🔁 Manually calling seats API from page context...');
  const manual = await page.evaluate(async (eventId, theaterId) => {
    const results = [];
    const attempts = [
      {
        label: 'direct tickets API',
        url: `https://tickets.cinema-city.co.il/api/seats/seats-statusV2?presentationId=${eventId}&venueTypeId=1&isReserved=1`,
        opts: { credentials: 'include' },
      },
      {
        label: 'relative /tickets path',
        url: `/tickets/api/seats/seats-statusV2?presentationId=${eventId}&venueTypeId=1&isReserved=1`,
        opts: { credentials: 'include' },
      },
    ];
    for (const { label, url, opts } of attempts) {
      try {
        const res = await fetch(url, {
          ...opts,
          headers: { 'Accept': 'application/json' },
        });
        let body = null;
        try { body = await res.json(); } catch { body = (await res.text()).slice(0, 200); }
        results.push({ label, status: res.status, bodyPreview: JSON.stringify(body).slice(0, 400) });
      } catch (e) {
        results.push({ label, error: e.message });
      }
    }
    return results;
  }, EVENT_ID, THEATER_ID);

  console.log('\n📊 Manual API calls from page context:');
  for (const r of manual) {
    console.log(`  ${r.label}: status=${r.status} ${r.error ? 'err=' + r.error : 'body=' + r.bodyPreview}`);
  }

  // Step 4: dump cookies for reference
  const cookies = await page.cookies();
  console.log('\n🍪 Cookies:', cookies.map((c) => `${c.name}=${c.value.slice(0, 15)}...`).join(', '));

  // Step 5: check for seat map on the page
  const seatCount = await page.evaluate(() => {
    let n = 0;
    for (const g of document.querySelectorAll('g')) if (g.querySelector(':scope > use')) n++;
    return n;
  });
  console.log('💺 Seat groups in DOM:', seatCount);

  // Step 6: look for reCAPTCHA / error text
  const bodyText = await page.evaluate(() => (document.body ? document.body.innerText : '').slice(0, 500));
  console.log('📄 Body text:', bodyText.replace(/\n+/g, ' | '));

  console.log('\n📊 Intercepted API log:');
  for (const e of apiLog) {
    console.log(`  ${e.status} ${e.url}`);
    if (e.body) {
      console.log('    Body:', JSON.stringify(e.body).slice(0, 500));
    } else if (e.text) {
      console.log('    Text:', e.text.slice(0, 300));
    } else if (e.error) {
      console.log('    Err:', e.error);
    }
  }

  await browser.close();
  console.log('\n🏁 Done.');
}

probe().catch((err) => { console.error('❌ Fatal:', err); process.exit(1); });

