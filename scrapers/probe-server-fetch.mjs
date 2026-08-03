/**
 * Probe: Test server-side fetching of the Cinema City seats API.
 *
 * Goal: Determine whether the seats-statusV2 API can be reached with a
 * plain Node fetch (no browser) — and if so, which headers / cookie
 * establishment are required. This informs how to build a reliable proxy
 * for the client app.
 *
 * Usage: node scrapers/probe-server-fetch.mjs
 */
const EVENT_ID = '838451';
const THEATER_ID = '1170';
const API_URL = `https://tickets.cinema-city.co.il/api/seats/seats-statusV2?presentationId=${EVENT_ID}&venueTypeId=1&isReserved=1`;
const HOME_URL = 'https://www.cinema-city.co.il/';
const TICKETS_HOME = 'https://tickets.cinema-city.co.il/';
const ORDER_URL = `https://www.cinema-city.co.il/order/?eventID=${EVENT_ID}&theaterId=${THEATER_ID}`;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const BASE_HEADERS = {
  'User-Agent': UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
};

function cookieHeader(cookies) {
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

async function tryFetch(label, url, headers = {}, opts = {}) {
  try {
    const res = await fetch(url, { headers, redirect: 'manual', ...opts });
    const text = await res.text();
    console.log(`\n${label}`);
    console.log(`  Status: ${res.status}  (${res.statusText})`);
    console.log(`  Final URL: ${res.url}`);
    console.log(`  Set-Cookie count: ${(res.headers.getSetCookie?.() ?? []).length}`);
    console.log(`  Body: ${text.slice(0, 400).replace(/\n/g, ' ')}`);
    return res;
  } catch (e) {
    console.log(`\n${label}`);
    console.log(`  ❌ Error: ${e.message}`);
    return null;
  }
}

// ─── 1. Plain fetch, no cookies ─────────────────────────────────────────
await tryFetch('1. Plain API fetch (no cookies)', API_URL, BASE_HEADERS);

// ─── 2. With Referer header only ────────────────────────────────────────
await tryFetch('2. API fetch with Referer (order page)', API_URL, {
  ...BASE_HEADERS,
  Referer: ORDER_URL,
});

// ─── 3. Establish cookies on home page, then call API ───────────────────
console.log('\n\n─── Phase 3: Establish cookies first ───');
const homeRes = await fetch(HOME_URL, { headers: { ...BASE_HEADERS, Accept: 'text/html' }, redirect: 'manual' });
console.log('Home page status:', homeRes.status, '| final:', homeRes.url);
const homeCookies = homeRes.headers.getSetCookie?.() ?? [];
console.log('Home set-cookie:', homeCookies.length ? homeCookies.map((c) => c.split(';')[0]).join(', ') : '(none)');

await tryFetch('3. API fetch WITH home cookies + Referer', API_URL, {
  ...BASE_HEADERS,
  Cookie: cookieHeader(homeCookies),
  Referer: ORDER_URL,
});

// ─── 4. Establish cookies on tickets subdomain, then call API ───────────
console.log('\n\n─── Phase 4: Establish cookies on tickets subdomain ───');
const tkRes = await fetch(TICKETS_HOME, { headers: { ...BASE_HEADERS, Accept: 'text/html' }, redirect: 'manual' });
console.log('Tickets home status:', tkRes.status, '| final:', tkRes.url);
const tkCookies = tkRes.headers.getSetCookie?.() ?? [];
console.log('Tickets set-cookie:', tkCookies.length ? tkCookies.map((c) => c.split(';')[0]).join(', ') : '(none)');

await tryFetch('4. API fetch WITH tickets cookies + Referer', API_URL, {
  ...BASE_HEADERS,
  Cookie: cookieHeader(tkCookies),
  Referer: `https://tickets.cinema-city.co.il/order/${EVENT_ID}`,
});

// ─── 5. Try the seatplan endpoint (static hall data) ────────────────────
await tryFetch('5. Seatplan API (no cookies)', 'https://tickets.cinema-city.co.il/api/seats/seatplanV2?venueId=1170&seatplanId=1', BASE_HEADERS);

console.log('\n\n🏁 Probe complete.');
process.exit(0);

