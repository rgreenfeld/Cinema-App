/**
 * Probe: Discover the base URL prefix for the `Pic` poster filenames returned
 * by the EventsFlat API (e.g. "גבעה 338.jpg"). We already confirmed each item
 * carries a real `Pic` filename; now we need the CDN / image base path.
 *
 * Approach: capture every image request on the homepage + schedule page and
 * look for paths containing a known Pic filename, or a generic movie-image
 * directory. We also scan the JS bundles for an image base constant.
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

  // Capture all image requests.
  const imgRequests = [];
  page.on('request', (req) => {
    const u = req.url();
    if (req.resourceType() === 'image' || /\.(jpg|jpeg|png|webp)/i.test(u)) {
      imgRequests.push(u);
    }
  });

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2500));
  await page.evaluate(() => document.querySelector('.gdpr-accept-triger')?.click()).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));

  console.log('=== Image requests captured (homepage) ===');
  [...new Set(imgRequests)].slice(0, 60).forEach((u) => console.log('  ', u));

  // Try to locate any <img> on the homepage that uses one of the Pic filenames,
  // and dump the DOM image paths.
  const domImgs = await page.evaluate(() => {
    return Array.from(document.images).map((i) => i.src).filter((s) => /\.(jpg|jpeg|png|webp)/i.test(s)).slice(0, 40);
  });
  console.log('\n=== DOM <img> srcs (homepage) ===');
  domImgs.forEach((u) => console.log('  ', u));

  // Navigate to a schedule/tickets page which shows movie posters with the Pic filenames.
  console.log('\nNavigating to /tickets...');
  await page.goto(`${BASE_URL}/tickets`, { waitUntil: 'networkidle2', timeout: 40000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));

  const ticketsImgs = await page.evaluate(() =>
    Array.from(document.images).map((i) => i.src).filter((s) => /\.(jpg|jpeg|png|webp)/i.test(s)).slice(0, 50)
  );
  console.log('=== DOM <img> srcs (tickets page) ===');
  ticketsImgs.forEach((u) => console.log('  ', u));

  // Fetch JS bundles and grep for image base paths / posters directory.
  console.log('\n=== Scraping JS bundles for image base ===');
  const candidates = [
    '/js/common.js',
    '/js/ticketsNew2.js',
    '/js/init.js',
    '/js/site.js',
  ];
  for (const src of candidates) {
    try {
      const r = await fetch(BASE_URL + src, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const text = await r.text();
      const hits = text.match(/https?[^"'\s]*(?:pic|picPath|poster|image|img|upload|content|files|media)[^"'\s]*/gi) || [];
      const interesting = [...new Set(hits)].filter((s) => /\.(jpg|jpeg|png|webp)|pic|upload|content|files|images|poster|img/i.test(s)).slice(0, 20);
      if (interesting.length) {
        console.log(`--- ${src} ---`);
        interesting.forEach((s) => console.log('  ', s));
      }
    } catch {}
  }

  await browser.close();
  console.log('\n🏁 Done.');
}
probe().catch((e) => { console.error('❌', e); process.exit(1); });
