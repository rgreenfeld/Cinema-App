/**
 * Probe: Use Puppeteer to intercept Cinema City's seats-statusV2 API response.
 *
 * Steps:
 *   1. Visit home page to establish session cookies.
 *   2. Navigate to the order page for a specific event.
 *   3. Intercept the seats-statusV2 API call and log the response.
 */
import puppeteer from 'puppeteer';

const EVENT_ID = '838451';
const THEATER_ID = '1170';
const BASE_URL = 'https://www.cinema-city.co.il';
const ORDER_URL = `${BASE_URL}/order/?eventID=${EVENT_ID}&theaterId=${THEATER_ID}`;

async function probe() {
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: false, // Set to true for headless, but false helps with session cookies
    defaultViewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });

  // Track API calls
  const apiResponses = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('seats-statusV2') || url.includes('seats-status')) {
      console.log('\n🔎 Intercepted API call:', url);
      try {
        const json = await response.json();
        apiResponses.push(json);
        console.log('✅ API Response status:', response.status());
        console.log('Response type:', Array.isArray(json) ? 'array' : 'object');
        if (Array.isArray(json)) {
          console.log('Array length (seat count):', json.length);
          let avail = 0;
          const rows = new Set();
          const seatNums = new Set();
          for (const seat of json) {
            const status = seat.status ?? seat.Status ?? seat.s;
            if (status === 0 || status === false || status === '0' || status === 'free') avail++;
            const row = seat.row ?? seat.Row ?? seat.r;
            if (row != null) rows.add(row);
            const seatNum = seat.seat ?? seat.Seat ?? seat.seatNum ?? seat.seatNumber ?? seat.SeatNum ?? seat.SeatNumber;
            if (seatNum != null) seatNums.add(seatNum);
          }
          console.log('Available seats:', avail);
          console.log('Total seats:', json.length);
          console.log('Distinct rows:', rows.size);
          console.log('Rows:', [...rows].sort((a,b)=>a-b));
          // Show first 3 seats
          console.log('First 3 seats:', JSON.stringify(json.slice(0, 3)));
          // Show last 3 seats
          console.log('Last 3 seats:', JSON.stringify(json.slice(-3)));
        } else {
          const keys = Object.keys(json);
          console.log('Object keys:', keys.join(', '));
          // Check for nested arrays
          for (const key of keys) {
            if (Array.isArray(json[key])) {
              console.log(`  ${key}: array of length ${json[key].length}`);
            } else if (typeof json[key] === 'object' && json[key] !== null) {
              console.log(`  ${key}: object with keys ${Object.keys(json[key]).join(', ')}`);
            } else {
              console.log(`  ${key}: ${json[key]}`);
            }
          }
        }
      } catch (e) {
        console.log('❌ Could not parse API response:', e.message);
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

  console.log(`\n🌐 Step 2: Navigating to order page for event ${EVENT_ID}...`);
  await page.goto(ORDER_URL, { waitUntil: 'networkidle2', timeout: 45000 });

  // Wait for the API call to be made (the page loads the seat map dynamically)
  console.log('⏳ Waiting for seat data to load...');
  await new Promise((r) => setTimeout(r, 8000));

  // Also try to extract from the page's Nuxt state
  const nuxtData = await page.evaluate(() => {
    try {
      // Try to access Vuex store state
      if (window.__NUXT__) {
        const state = window.__NUXT__.state;
        if (state && state.booking && state.booking.Phaser) {
          console.log('Vuex store Phaser:', JSON.stringify(state.booking.Phaser).slice(0, 500));
        }
        if (state && state.booking && state.booking.Seats) {
          console.log('Vuex store Seats:', JSON.stringify(state.booking.Seats).slice(0, 500));
        }
      }
    } catch(e) { console.log('Nuxt error:', e.message); }
    return null;
  });

  console.log(`\n📊 Summary: Intercepted ${apiResponses.length} API response(s)`);

  if (apiResponses.length === 0) {
    console.log('⚠️ No API responses intercepted. The seat data might be loaded via WebSocket or different endpoint.');
    console.log('Let me try to get the cookies from the page and use them...');
    
    const cookies = await page.cookies();
    console.log('Cookies:', cookies.map(c => `${c.name}=${c.value.slice(0,20)}...`).join(', '));
    
    // Try to manually call the API with the session cookies
    const manualResult = await page.evaluate(async (eventId) => {
      try {
        const res = await fetch(`https://tickets.cinema-city.co.il/api/seats/seats-statusV2?presentationId=${eventId}&venueTypeId=1&isReserved=1`, {
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
          const json = await res.json();
          return json;
        }
        return { error: 'HTTP ' + res.status };
      } catch (e) {
        return { error: e.message };
      }
    }, EVENT_ID);
    
    console.log('Manual API call result:', JSON.stringify(manualResult).slice(0, 2000));
  }

  await browser.close();
  console.log('🏁 Done.');
}

probe().catch(console.error);
