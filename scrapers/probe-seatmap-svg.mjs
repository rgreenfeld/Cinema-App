/**
 * Probe: Parse the seatmap SVG from the Cinema City order page to extract:
 *   - Total number of rows
 *   - Total number of seats
 *   - Available seats
 *   - Unavailable/occupied seats
 *
 * URL: https://tickets.cinema-city.co.il/order/838451
 *
 * The seat map is gated behind an (invisible) reCAPTCHA, so this probe:
 *   1. Establishes session cookies on the home page.
 *   2. Navigates to the order page.
 *   3. Waits / interacts to let reCAPTCHA solve.
 *   4. Parses seats from the rendered SVG:
 *        - <use> class "s a"  → available seat
 *        - <use> class "s ua" → unavailable/occupied seat
 *        - row extracted from aria-description ("שורה: 1 מושב: 1 - ...")
 *   5. Falls back to intercepting the seats-statusV2 API if the SVG never renders.
 */
import puppeteer from 'puppeteer';

const EVENT_ID = '838451';
const BASE_URL = 'https://www.cinema-city.co.il';
const ORDER_URL = `https://tickets.cinema-city.co.il/order/${EVENT_ID}`;

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

  // Hide webdriver flag
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // @ts-ignore
    window.chrome = { runtime: {} };
  });

  // Track seat API responses
  const apiResponses = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('seats-statusV2') || url.includes('seatplanV2')) {
      console.log('\n🔎 Intercepted API call:', url);
      try {
        const json = await response.json();
        apiResponses.push({ url, json });
        console.log('   Status:', response.status(), '| Type:', Array.isArray(json) ? 'array' : 'object');
      } catch (e) {
        console.log('   Could not parse body:', e.message);
      }
    }
  });

  console.log('🌐 Step 1: Visiting home page to establish session...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2000));

  // Dismiss GDPR banner if present
  await page.evaluate(() => {
    const btn = document.querySelector('.gdpr-accept-triger');
    if (btn) btn.click();
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));

  console.log(`🌐 Step 2: Navigating to order page for event ${EVENT_ID}...`);
  await page.goto(ORDER_URL, { waitUntil: 'networkidle2', timeout: 45000 });
  console.log('   Final URL:', page.url());

  // Simulate human-like mouse movement to help invisible reCAPTCHA pass
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(100 + Math.random() * 1000, 100 + Math.random() * 600);
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));
  }

  // Wait for seatmap to render — poll for seat <use> elements for up to 40s
  console.log('⏳ Waiting for seatmap SVG to render (up to 40s)...');
  const started = Date.now();
  let seatGroupsFound = 0;

  while (Date.now() - started < 40000) {
    seatGroupsFound = await page.evaluate(() => {
      let count = 0;
      for (const g of document.querySelectorAll('g')) {
        if (g.querySelector(':scope > use')) count++;
      }
      return count;
    });
    if (seatGroupsFound > 0) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log('Seat groups found after wait:', seatGroupsFound);

  // ─── Extract seat data from the SVG ─────────────────────────────────────
  const result = await page.evaluate(() => {
    const out = {
      pageTitle: document.title,
      seatGroups: 0,
      available: 0,
      unavailable: 0,
      unknownClass: 0,
      rows: new Set(),
      sampleGroups: [],
      svgCount: 0,
      bodyHasRecaptchaError: false,
      bodyText: (document.body ? document.body.innerText : '').slice(0, 800),
    };

    if (out.bodyText.includes('reCAPTCHA')) out.bodyHasRecaptchaError = true;

    const svgs = document.querySelectorAll('svg');
    out.svgCount = svgs.length;

    // Locate seat <g> groups: groups whose direct child is a <use>
    const groups = Array.from(document.querySelectorAll('g'));
    let seatGroups = [];

    for (const g of groups) {
      const use = g.querySelector(':scope > use');
      if (use) seatGroups.push(g);
    }

    // Fallback: any <use> parent
    if (seatGroups.length === 0) {
      seatGroups = Array.from(document.querySelectorAll('use'))
        .map((u) => u.parentElement)
        .filter(Boolean);
    }

    out.seatGroups = seatGroups.length;

    for (const g of seatGroups) {
      const use = g.querySelector(':scope > use') || g.querySelector('use');
      if (!use) continue;

      const cls = use.getAttribute('class') || '';
      let status = 'unknown';
      if (/\bs\b/.test(cls)) {
        if (/\ba\b/.test(cls)) status = 'available';
        else if (/\bua\b/.test(cls)) status = 'unavailable';
        else if (/\bo\b/.test(cls)) status = 'unavailable';
        else status = 'unknown-class-' + cls.trim();
      } else {
        status = 'unknown-class-' + cls.trim();
      }

      const aria = g.getAttribute('aria-description') || use.getAttribute('aria-description') || '';
      let row = null;
      let seatNum = null;
      if (aria) {
        const rowMatch = aria.match(/שורה\s*[:：]?\s*(\d+)/);
        const seatMatch = aria.match(/מושב\s*[:：]?\s*(\d+)/);
        if (rowMatch) row = rowMatch[1];
        if (seatMatch) seatNum = seatMatch[1];
        if (row) out.rows.add(row);
      }

      if (status === 'available') out.available++;
      else if (status === 'unavailable') out.unavailable++;
      else out.unknownClass++;

      if (out.sampleGroups.length < 3) {
        out.sampleGroups.push({
          useClass: cls,
          aria,
          row,
          seatNum,
          status,
          gClass: g.getAttribute('class') || '',
        });
      }
    }

    out.rowList = Array.from(out.rows).sort((a, b) => Number(a) - Number(b));
    return out;
  });

  // ─── Report ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('📊 SEATMAP SVG PARSE RESULTS');
  console.log('═══════════════════════════════════════════');
  console.log('Page title:', result.pageTitle);
  console.log('SVG elements found:', result.svgCount);
  console.log('Seat groups found:', result.seatGroups);
  console.log('reCAPTCHA error on page:', result.bodyHasRecaptchaError);
  console.log('Available seats (s a):', result.available);
  console.log('Unavailable seats (s ua):', result.unavailable);
  console.log('Unknown class seats:', result.unknownClass);
  console.log('Total seats (avail + unavail):', result.available + result.unavailable);
  console.log('Total rows:', result.rowList.length);
  console.log('Rows:', result.rowList.join(', '));

  if (result.sampleGroups.length > 0) {
    console.log('\nSample seat groups:');
    for (const s of result.sampleGroups) {
      console.log('  ', JSON.stringify(s));
    }
  }

  if (result.available + result.unavailable === 0 && result.bodyHasRecaptchaError) {
    console.log('\n⚠ Seat map blocked by reCAPTCHA.');
    console.log('   Body text preview:', result.bodyText);
  }

  // ─── Report intercepted API responses ──────────────────────────────────
  if (apiResponses.length > 0) {
    console.log(`\n📊 Intercepted ${apiResponses.length} seat API response(s):`);
    for (const { url, json } of apiResponses) {
      console.log('  URL:', url.split('?')[0], '?', url.split('?')[1]?.slice(0, 80));
      if (Array.isArray(json)) {
        let avail = 0;
        const rows = new Set();
        for (const seat of json) {
          const status = seat.status ?? seat.Status ?? seat.s;
          if (status === 0 || status === false || status === '0' || status === 'free') avail++;
          const row = seat.row ?? seat.Row ?? seat.r;
          if (row != null) rows.add(row);
        }
        console.log(`   → array of ${json.length} seats, ${avail} available, ${rows.size} rows`);
        console.log('   First seat:', JSON.stringify(json[0]));
      } else if (json && typeof json === 'object') {
        const seats = json.seats;
        if (seats && typeof seats === 'object' && !Array.isArray(seats)) {
          const keys = Object.keys(seats);
          let avail = 0;
          const rows = new Set();
          for (const key of keys) {
            const parts = key.split('_');
            if (parts.length >= 2) rows.add(parts[1]);
            const v = seats[key];
            if (v === 0 || v === '0' || v === false) avail++;
          }
          console.log(`   → seats map of ${keys.length} seats, ${avail} available, ${rows.size} rows`);
          console.log('   Sample keys:', keys.slice(0, 5).join(', '));
        } else {
          console.log('   → object keys:', Object.keys(json).join(', '));
        }
      }
    }
  }

  await browser.close();
  console.log('\n🏁 Done.');
}

probe().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

