/**
 * Probe: Discover the Cinema City venue-type API. The site's Knockout
 * ViewModel has a venue/hall-type selector (Lounge, Onyx, VIP, Prime...).
 * This probe:
 *   1. Loads the schedule page for Glilot and captures ALL api/xhr calls.
 *   2. Searches the page JS bundles for endpoint strings containing
 *      Venue / Type / Events / Hall / Auditorium.
 *   3. Tries candidate endpoints to enumerate the venue types at Glilot.
 */
import puppeteer from 'puppeteer';

const BASE_URL = 'https://www.cinema-city.co.il';

async function probe() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 1100 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });

  // Capture every XHR/fetch request and response.
  const calls = [];
  page.on('request', (req) => {
    const u = req.url();
    const t = req.resourceType();
    if (t === 'xhr' || t === 'fetch' || /\/api\/|\/tickets\//i.test(u)) {
      calls.push({ method: req.method(), url: u, type: t });
    }
  });
  page.on('response', async (res) => {
    const u = res.url();
    if (/(venue|Venue|type|Type|events|Events)/.test(u) && /\/api\/|\/tickets\//i.test(u)) {
      let body = '';
      try {
        const ct = res.headers()['content-type'] || '';
        body = ct.includes('json') ? JSON.stringify(await res.json()).slice(0, 400) : (await res.text()).slice(0, 300);
      } catch {}
      calls.push({ METHOD: 'RESP', url: u, status: res.status(), body });
    }
  });

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2000));
  await page.evaluate(() => document.querySelector('.gdpr-accept-triger')?.click()).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));

  // Search all loaded script files for endpoint strings pointing at venue/type/events APIs.
  const jsHits = await page.evaluate(() => {
    const out = [];
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    // We'll also scan inline scripts here; full external scanning happens in Node below via bodies.
    const inline = Array.from(document.querySelectorAll('script:not([src])')).map((s) => s.textContent || '').join('\n');
    const pats = /(?:url|Url|api|Api|href|endpoint|URL)[^\"']*[\"']([^\"']*(?:Venue|venue|Event|event|Type|type|Hall|hall|Auditorium|auditorium)[^\"']*)[\"']/g;
    let m;
    while ((m = pats.exec(inline))) out.push(m[1]);
    return { inlineHits: [...new Set(out)], scripts: scripts.map((s) => s.src) };
  });
  console.log('=== Inline JS endpoint hits ===');
  console.log(JSON.stringify(jsHits.inlineHits, null, 2));
  console.log('\nScript sources:', jsHits.scripts.join('\n'));

  // Fetch each script and grep for 'Venue' / 'Events' endpoint strings.
  console.log('\n=== Searching script bodies for endpoint strings ===');
  const endpointPattern = new RegExp("[^\"'\\s]*?(?:venue|Venue|Veneu|events|Events|Hall|Type)[^\"'\\s]*", 'g');
  for (const src of jsHits.scripts.slice(0, 30)) {
    try {
      const res = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const text = await res.text();
      const found = text.match(endpointPattern) || [];
      const interesting = [...new Set(found)].filter((s) => /venue|Venue|events|Events|Hall/i.test(s) && s.length < 80 && !s.includes('.js'));
      if (interesting.length) {
        console.log(`\n--- ${src} ---`);
        interesting.slice(0, 25).forEach((s) => console.log('  ', s));
      }
    } catch {}
  }

  // Try candidate endpoint URLs to list venue types for Glilot (1170).
  console.log('\n=== Trying candidate venue-type endpoints (Glilot 1170) ===');
  const candidates = [
    '/tickets/VenueTypes?TheatreId=1170',
    '/tickets/GetVenueTypes?TheatreId=1170',
    '/tickets/GetVenueType?TheatreId=1170',
    '/tickets/VenueTypes?theaterId=1170',
    '/api/theaters/1170/venues',
    '/tickets/GetTheaterVenues?TheatreId=1170',
    '/tickets/GetVenuesByTheater?TheatreId=1170',
    '/api/Venues/GetVenueTypes?TheatreId=1170',
    '/tickets/GetVenueTypesByTheaterId?TheaterId=1170',
    '/api/Theaters/GetTheaters',
    '/tickets/GetTheaters',
    '/api/Cinemas',
    '/tickets/Cinemas',
    '/api/venues/GetVenues',
    '/tickets/GetVenues?TheatreId=1170',
    '/api/Theaters/1170',
    '/tickets/TheatreDetails?TheatreId=1170',
    '/api/theater/1170/venue-types',
    '/tickets/VenueTypeList?TheaterId=1170',
  ];
  for (const path of candidates) {
    const r = await page.evaluate(async (p) => {
      try {
        const res = await fetch(p, { credentials: 'include' });
        if (res.status >= 400) return { p, status: res.status, body: '' };
        const ct = res.headers.get('content-type') || '';
        const txt = await res.text();
        return { p, status: res.status, ct, body: txt.slice(0, 500) };
      } catch (e) {
        return { p, error: e.message };
      }
    }, path);
    console.log(`\n[${r.status ?? r.error}] ${r.p}`);
    if (r.body) console.log('   ', r.body.replace(/\n/g, ' ').slice(0, 350));
  }

  await browser.close();
  console.log('\n🏁 Done.');
}
probe().catch((e) => { console.error('❌', e); process.exit(1); });

