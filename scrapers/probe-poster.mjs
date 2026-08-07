/**
 * Probe: Determine whether the Cinema City EventsFlat payload exposes any
 * real movie poster / image URL field we can scrape. If found, we enable
 * Option A (persist poster_url). If not, we fall back to Option B (frontend
 * only hides fake data).
 */
import puppeteer from 'puppeteer';

const BASE_URL = 'https://www.cinema-city.co.il';

async function probe() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2000));
  await page.evaluate(() => document.querySelector('.gdpr-accept-triger')?.click()).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));

  // 1) Dump the FULL raw keys of every EventsFlat item looking for image fields.
  const result = await page.evaluate(async () => {
    const res = await fetch('/tickets/EventsFlat?TheatreId=1170&VenueTypeId=0&MovieId=0&Date=0', { credentials: 'include' });
    if (!res.ok) return { error: res.status };
    const data = await res.json();
    const allKeys = new Set();
    const collect = (obj, prefix = '') => {
      if (obj === null || typeof obj !== 'object') return;
      for (const k of Object.keys(obj)) {
        allKeys.add(prefix + k);
        collect(obj[k], prefix + k + '.');
      }
    };
    for (const item of data) collect(item);
    // Specifically hunt for image-ish values.
    const imageFields = [];
    const walk = (obj, path = 'item') => {
      if (obj === null || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        const kl = k.toLowerCase();
        if (/img|image|poster|photo|picture|thumbnail|pic|cover|portrait|banner/i.test(kl)) {
          imageFields.push(`${path}.${k} = ${JSON.stringify(v).slice(0, 300)}`);
        }
        walk(v, `${path}.${k}`);
      }
    };
    for (const item of data) walk(item);
    return { count: data.length, allKeys: [...allKeys].sort(), imageFields: imageFields.slice(0, 40) };
  });

  console.log('=== EventsFlat for Glilot (1170) ===');
  console.log('Item count:', result.count);
  console.log('\nALL keys (deep):\n', result.allKeys.join('\n'));
  console.log('\n=== Image/poster-related fields ===');
  if (result.imageFields.length) {
    result.imageFields.forEach((f) => console.log('  ', f));
  } else {
    console.log('  (no image/poster fields found in EventsFlat)');
  }

  // 2) Try the movie page HTML for og:image / poster links.
  console.log('\n=== Movie page HTML og:image / poster ===');
  const pageInfo = await page.evaluate(async () => {
    // Take a real movie title from the payload we already have (fallback hardcoded).
    const res = await fetch('/he/movie/%D7%A1%D7%A4%D7%99%D7%99%D7%93%D7%A8%D7%9E%D7%9F-%D7%99%D7%95%D7%9D-%D7%97%D7%93%D7%A9', { credentials: 'include' });
    if (!res.ok) return { error: res.status };
    const html = await res.text();
    const og = [];
    const m = html.match(/<meta[^>]*(?:og:image|og:image:url|twitter:image)[^>]*>/gi) || [];
    og.push(...m.map((x) => x.slice(0, 200)));
    const imgTags = html.match(/<img[^>]+src="[^"]*"[^>]*>/gi) || [];
    const posterish = imgTags.filter((t) => /poster|movie|film|cover|Portrait|\.jpg|\.jpeg|\.png/i.test(t)).slice(0, 10);
    return { og, posterish };
  });
  if (pageInfo.og) {
    console.log('og:image metas:', JSON.stringify(pageInfo.og, null, 2));
    console.log('poster-ish <img> tags:', JSON.stringify(pageInfo.posterish, null, 2));
  } else {
    console.log('Movie page fetch error:', pageInfo.error);
  }

  await browser.close();
  console.log('\n🏁 Done.');
}
probe().catch((e) => { console.error('❌', e); process.exit(1); });
