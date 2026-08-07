/**
 * Probe: Enumerate EVERY distinct VenueType value returned by the
 * EventsFlat API across all branches. The scraper only maps ""
 * -> "רגיל" and "Vip" -> "VIP", but this shows whether the API ACTUALLY
 * returns other venue types (Lounge, Onyx, Prime, IMAX, 4DX, ScreenX...).
 *
 * It also tries the EventsFlat endpoint with specific VenueTypeId filters
 * to see if filtering exposes additional venue types.
 */
import puppeteer from 'puppeteer';

const BASE_URL = 'https://www.cinema-city.co.il';

const BRANCHES = [
  { name: 'גלילות', theaterId: 1170 },
  { name: 'ראשל"צ', theaterId: 1173 },
  { name: 'ירושלים', theaterId: 1174 },
  { name: 'כפר-סבא', theaterId: 1175 },
  { name: 'נתניה', theaterId: 1176 },
  { name: 'חדרה', theaterId: 1350 },
  { name: 'באר שבע', theaterId: 1178 },
  { name: 'אשדוד', theaterId: 1181 },
];

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

  // Global tally of every distinct VenueType.
  const tally = {};
  let totalItems = 0;

  for (const branch of BRANCHES) {
    process.stdout.write(`${branch.name}: `);
    const result = await page.evaluate(async (theaterId) => {
      const res = await fetch(`/tickets/EventsFlat?TheatreId=${theaterId}&VenueTypeId=0&MovieId=0&Date=0`, {
        credentials: 'include',
      });
      if (!res.ok) return null;
      return await res.json();
    }, branch.theaterId);

    if (!result || !Array.isArray(result)) { console.log('no data'); continue; }

    const branchCounts = {};
    for (const item of result) {
      const vt = item.VenueType || '(empty)';
      branchCounts[vt] = (branchCounts[vt] || 0) + 1;
      tally[vt] = (tally[vt] || 0) + 1;
      totalItems++;
    }
    console.log(JSON.stringify(branchCounts));
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log('\n═══════════════════════════════════════════');
  console.log(`Total items across all branches: ${totalItems}`);
  console.log('\nEvery distinct VenueType value (across all branches):');
  for (const [vt, count] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  "${vt}": ${count}`);
  }

  // Now try VenueTypeId-specific filters to see if we can enumerate venue types.
  console.log('\n═══════════════════════════════════════════');
  console.log('Trying VenueTypeId filters (Glilot 1170)...');
  for (let venueTypeId = 0; venueTypeId <= 6; venueTypeId++) {
    const res = await page.evaluate(async (tid) => {
      const r = await fetch(`/tickets/EventsFlat?TheatreId=1170&VenueTypeId=${tid}&MovieId=0&Date=0`, {
        credentials: 'include',
      });
      if (!r.ok) return { error: r.status };
      return await r.json();
    }, venueTypeId);
    if (res && Array.isArray(res) && res.length > 0) {
      const badges = {};
      for (const item of res) {
        const b = (item.VenueType || '(empty)');
        badges[b] = (badges[b] || 0) + 1;
      }
      console.log(`  VenueTypeId=${venueTypeId}: ${res.length} items → ${JSON.stringify(badges)}`);
    } else {
      console.log(`  VenueTypeId=${venueTypeId}: ${Array.isArray(res) ? '0 items' : JSON.stringify(res)}`);
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  await browser.close();
  console.log('\n🏁 Done.');
}
probe().catch((e) => { console.error('❌', e); process.exit(1); });

