/**
 * Probe: Inspect the Cinema City order page to find the hall/venue label
 * (Lounge, Onyx, VIP, Prime, IMAX...) that the site displays for an event.
 *
 * The schedule/EventsFlat API only exposes VenueType of "" or "Vip",
 * yet the website clearly shows Onyx / Lounge halls. This probe checks the
 * order page DOM + sessionStorage/localStorage for a venue name field.
 */
import puppeteer from 'puppeteer';

const BASE_URL = 'https://www.cinema-city.co.il';

// We'll pick a few real event IDs we can resolve. First an Onyx/VIP display.
async function probe() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2000));
  await page.evaluate(() => document.querySelector('.gdpr-accept-triger')?.click()).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));

  // Grab one VIP + one regular event to compare order pages.
  const pick = await page.evaluate(async () => {
    const res = await fetch('/tickets/EventsFlat?TheatreId=1170&VenueTypeId=0&MovieId=0&Date=0', {
      credentials: 'include',
    });
    const data = await res.json();
    const vip = data.find((x) => String(x.VenueType).toLowerCase() === 'vip');
    const regular = data.find((x) => String(x.VenueType).trim() === '');
    return {
      vip: vip ? { id: vip.Dates.EventId, name: vip.Name, type: vip.VenueType } : null,
      regular: regular ? { id: regular.Dates.EventId, name: regular.Name, type: regular.VenueType } : null,
    };
  });
  console.log('Picked:', JSON.stringify(pick, null, 2));

  for (const label of ['Regular', 'VIP']) {
    const ev = pick[label.toLowerCase()];
    if (!ev) { console.log(`\nNo ${label} event found`); continue; }
    const url = `${BASE_URL}/order/?eventID=${ev.id}&theaterId=1170`;
    console.log(`\n=== ORDER PAGE: ${label} (${ev.name}, event ${ev.id}) ===`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 5000));

    // Capture XHR/fetch requests to see what data endpoints fire.
    const s = await page.evaluate(async () => {
      const out = {
        title: document.title,
        visibleText: (document.body?.innerText || '').slice(0, 1200),
        venueKeywords: [],
        storage: {},
        scripts2: [],
      };
      // Hunt for venue/hall keywords in rendered text.
      const kw = ['ONYX', 'Onyx', 'VIP', 'Lounge', 'Prime', 'IMAX', '4DX', 'ScreenX', 'אולם', 'VIP'];
      for (const k of kw) {
        if (/(document.body?.innerText || '')/.test && document.body?.innerText.includes(k)) {
          out.venueKeywords.push(k);
        }
      }
      // Check session/local storage for venue hints.
      for (const store of ['localStorage', 'sessionStorage']) {
        try {
          const keys = Object.keys(window[store]);
          for (const kk of keys) {
            if (/venue|hall|type|screen|event|presentation|seat/i.test(kk)) {
              const v = window[store].getItem(kk) || '';
              out.storage[`${store}.${kk}`] = v.slice(0, 400);
            }
          }
        } catch {}
      }
      // Grab inline scripts that mention venue/hall.
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s0 of scripts) {
        const t = s0.textContent || '';
        if (/(VenueType|venuetype|HallName|hallName|Lounge|ONYX|auditorium|Auditorium)/i.test(t)) {
          out.scripts2.push(t.slice(0, 500));
          break;
        }
      }
      return out;
    });

    console.log('Title:', s.title);
    console.log('Venue keywords in text:', JSON.stringify(s.venueKeywords));
    console.log('Storage venue hints:', JSON.stringify(s.storage, null, 2));
    console.log('Scripts mentioning venue/hall:');
    (s.scripts2 || []).forEach((x) => console.log('  ' + x));
    const lines = s.visibleText.split('\n').filter((l) => l.trim() && /אולם|VIP|Onyx|Lounge|Prime|IMAX|אודיטוריום/i.test(l));
    console.log('Relevant visible lines:', JSON.stringify(lines.slice(0, 10)));
  }

  await browser.close();
  console.log('\n🏁 Done.');
}
probe().catch((e) => { console.error('❌', e); process.exit(1); });

