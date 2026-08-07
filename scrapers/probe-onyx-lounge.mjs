/**
 * Probe: Verify Glilot's Onyx (VenueTypeId=8) and Lounge (VenueTypeId=201)
 * screenings by querying EventsFlat with those specific venue-type filters.
 * The default VenueTypeId=0 returns mixed ""/Vip/Prime but never marks
 * Onyx/Lounge; this confirms whether the venue-type filter exposes them.
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

  // Glilot theaterId in the scraper is 1170 for EventsFlat. But the JS uses
  // theater().ID (1) for the venue-type list. Try both.
  const theaterIds = [1170, 1173, 1174, 1175, 1176, 1178, 1181, 1350];
  const venueTypeIds = [0, 1, 3, 8, 201, 7, 31];

  for (const theaterId of theaterIds) {
    console.log(`\n═══ TheatreId=${theaterId} ═══`);
    for (const vt of venueTypeIds) {
      const result = await page.evaluate(async ({ tid, vtid }) => {
        const res = await fetch(`/tickets/EventsFlat?TheatreId=${tid}&VenueTypeId=${vtid}&MovieId=0&Date=0`, {
          credentials: 'include',
        });
        if (!res.ok) return { vtid, error: res.status };
        const data = await res.json();
        const badges = {};
        for (const item of data) {
          const b = item.VenueType || '(empty)';
          badges[b] = (badges[b] || 0) + 1;
        }
        return { vtid, count: data.length, badges };
      }, { tid: theaterId, vtid: vt });
      const label = result.error
        ? `VenueTypeId=${vt}: error ${result.error}`
        : `VenueTypeId=${vt}: ${result.count} items → ${JSON.stringify(result.badges)}`;
      console.log('  ' + label);
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  await browser.close();
  console.log('\n🏁 Done.');
}
probe().catch((e) => { console.error('❌', e); process.exit(1); });
