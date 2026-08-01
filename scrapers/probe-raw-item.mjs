/**
 * Deep probe: dump the FULL raw structure of EventsFlat items, including
 * any nested attributes (Language, Dubbed, Subtitled, ScreenName, HallName,
 * VenueName, Attributes arrays, etc.) for both regular and VIP screenings.
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
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2000));

  const data = await page.evaluate(async () => {
    const res = await fetch('/tickets/EventsFlat?TheatreId=1170&VenueTypeId=0&MovieId=0&Date=0', {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return await res.json();
  });

  if (!data || !Array.isArray(data)) {
    console.log('No data');
    await browser.close();
    return;
  }

  console.log(`Total items: ${data.length}`);

  // Build a set of ALL keys appearing anywhere (top-level + Dates + nested)
  const allKeys = new Set();
  const collect = (obj, prefix = '') => {
    if (obj === null || typeof obj !== 'object') return;
    for (const k of Object.keys(obj)) {
      allKeys.add(prefix + k);
      collect(obj[k], prefix + k + '.');
    }
  };
  for (const item of data) collect(item);
  console.log('\n=== ALL KEYS seen across every item (deep) ===');
  console.log([...allKeys].sort().join('\n'));

  // Check for attribute-like fields on all items
  console.log('\n=== Attribute-related fields per item (non-empty) ===');
  const attrWords = ['language', 'Language', 'dubbed', 'Dubbed', 'subtitl', 'Subtitl',
    'VenueType', 'VenueName', 'ScreenName', 'HallName', 'ScreenType', 'HallType',
    'Attributes', 'Attribute', 'Format', 'IsVip', '4dx', 'imax', '3d', '2d', 'Onyx', 'Comfort'];
  let foundAny = false;
  for (const item of data) {
    const hits = [];
    const walk = (obj, path = 'item') => {
      if (obj === null || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        if (attrWords.some((w) => k.toLowerCase().includes(w.toLowerCase()))) {
          hits.push(`${path}.${k} = ${JSON.stringify(v).slice(0, 200)}`);
        }
        walk(v, `${path}.${k}`);
      }
    };
    walk(item);
    if (hits.length > 0) {
      foundAny = true;
      console.log(`\n${item.Name}:`);
      hits.slice(0, 10).forEach((h) => console.log('  ', h));
    }
  }
  if (!foundAny) console.log('(no attribute-like fields found)');

  // Dump one VIP item and one regular item fully
  const vip = data.find((x) => x.VenueType && String(x.VenueType).trim() !== '');
  const regular = data.find((x) => !x.VenueType || String(x.VenueType).trim() === '');
  console.log('\n=== FULL VIP item (first) ===');
  console.log(JSON.stringify(vip, null, 2));
  console.log('\n=== FULL regular item (first) ===');
  console.log(JSON.stringify(regular, null, 2));

  await browser.close();
}

probe().catch((e) => { console.error(e); process.exit(1); });

