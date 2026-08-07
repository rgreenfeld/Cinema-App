/**
 * Probe the Cinema City Knockout.js ViewModel to discover exactly where the
 * hall/venue type (Lounge, Onyx, VIP, Prime, IMAX, 4DX...) data lives and how
 * it is loaded, so we can wire the correct source into the scraper.
 *
 * It:
 *   1. Loads the homepage and the schedule/tickets page.
 *   2. Captures ALL network API calls (to see which endpoints provide data).
 *   3. Inspects the Knockout ViewModel: baseTheaters, selected.theater,
 *      venues, and any observable/field mentioning type/hall/venue/screen.
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
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });

  // Capture all network requests (methods + URLs) that look like APIs/data.
  const apiCalls = [];
  page.on('request', (req) => {
    const u = req.url();
    if (/\/api\/|\/tickets\/|theater|venue|\.json|getData|Theater|Venue/i.test(u)) {
      apiCalls.push(`${req.method()} ${u}`);
    }
  });

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2500));

  // Dismiss GDPR.
  await page.evaluate(() => {
    const btn = document.querySelector('.gdpr-accept-triger');
    if (btn) btn.click();
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));

  console.log('=== Network API calls captured (home + any navigation) ===');
  [...new Set(apiCalls)].forEach((c) => console.log('  ' + c));
  console.log('');

  // Inspect the Knockout ViewModel(s).
  const vm = await page.evaluate(() => {
    // Locate any ko applyBindings root / data-attrs, and global observables.
    const out = { koFound: false, viewModels: [] };

    // Find all elements bound with data-bind — their context is the VM.
    const bound = Array.from(document.querySelectorAll('[data-bind]')).slice(0, 5);
    const seen = new Set();

    const walkVm = (root, depth) => {
      if (!root || typeof root !== 'object' || depth > 4) return null;
      const info = {};
      for (const k of Object.keys(root)) {
        if (k.startsWith('__')) continue;
        let val;
        try { val = root[k]; } catch { continue; }
        if (typeof val === 'function') {
          // Attempt to unwrap ko.observable
          let unwrapped;
          try { unwrapped = val(); } catch { unwrapped = undefined; }
          const lower = k.toLowerCase();
          if (
            /theater|venue|hall|screen|type|branch|event|showtime/i.test(lower) &&
            unwrapped !== undefined && unwrapped !== null
          ) {
            info[k] = { value: unwrapped };
            if (seen.has(k + JSON.stringify(unwrapped).slice(0, 80))) continue;
            seen.add(k + JSON.stringify(unwrapped).slice(0, 80));
          }
        } else if (typeof val === 'object') {
          const nested = walkVm(val, depth + 1);
          if (nested) info['.' + k] = nested;
        }
      }
      return Object.keys(info).length ? info : null;
    };

    // Try to grab a VM from the known container elements.
    for (const el of bound) {
      const dataBind = el.getAttribute('data-bind') || '';
      out.viewModels.push({ bind: dataBind.slice(0, 120) });
    }

    // Dump global + DOM-accessible observables bound on common containers.
    if (window.ko) out.koFound = true;

    // Look for a top-level VM in the page body JS (scripts).
    const scriptText = Array.from(document.querySelectorAll('script'))
      .map((s) => s.textContent || '')
      .join(' ');
    const theaterPatterns = scriptText.match(/baseTheaters|VenueType|venueType|hallType|Onyx|Lounge|VIP/gi) || [];
    out.scriptMentions = [...new Set(theaterPatterns)].slice(0, 20);

    return out;
  });

  console.log('=== Knockout viewmodel inspection ===');
  console.log('ko present:', vm.koFound);
  console.log('ViewModels (bound elements):', JSON.stringify(vm.viewModels, null, 2));
  console.log('Script mentions of venue/theater/hall/Onyx/Lounge:', JSON.stringify(vm.scriptMentions));
  console.log('');

  // Now load the schedule/tickets page which shows venue selection & hall types.
  console.log('Navigating to schedule page...');
  const { data: apiCalls2 } = {};
  const api2 = [];
  page.on('request', (req) => {
    const u = req.url();
    if (/theater|venue|events|Theater|Venue/i.test(u)) api2.push(`${req.method()} ${u}`);
  });

  try {
    await page.goto(`${BASE_URL}/tickets`, { waitUntil: 'networkidle2', timeout: 40000 });
  } catch {}
  await new Promise((r) => setTimeout(r, 2500));

  const vm2 = await page.evaluate(() => {
    const out = { observables: {}, nested: {} };

    const collect = (obj, path, depth) => {
      if (!obj || typeof obj !== 'object' || depth > 6) return;
      for (const k of Object.keys(obj)) {
        if (k.startsWith('__')) continue;
        let v;
        try { v = obj[k]; } catch { continue; }
        const lower = k.toLowerCase();
        if (typeof v === 'function') {
          let unwrapped;
          try { unwrapped = v(); } catch { unwrapped = undefined; }
          if (/theater|venue|hall|screen|type|branch/i.test(lower) && unwrapped != null) {
            let display = unwrapped;
            if (typeof unwrapped === 'function') display = '[obs-fn]';
            const s = JSON.stringify(display).slice(0, 120);
            out.observables[path + '.' + k] = s;
          }
        } else if (Array.isArray(v) && /theater|venue|hall/i.test(lower)) {
          out.observables[path + '.' + k + '[]'] = 'array len ' + v.length + ': ' + JSON.stringify(v[0]).slice(0, 200);
          v.slice(0, 5).forEach((item, i) => {
            out.nested[path + '.' + k + '[' + i + ']'] = JSON.stringify(item).slice(0, 300);
          });
        } else if (typeof v === 'object' && v !== null) {
          collect(v, path + '.' + k, depth + 1);
        }
      }
    };

    // Grab ko root observables from known global/app objects.
    const globals = ['ko', 'app', 'App', 'baseTheaters', 'vm', 'viewModel', 'ViewModel', '_viewModel'];
    for (const g of globals) {
      try {
        if (window[g]) collect(window[g].observable ? null : window[g], g, 0);
      } catch {}
    }
    // Also walk any DOM element that has a ko dataFor() context.
    try {
      const el = document.querySelector('[data-bind]');
      if (el && window.ko) {
        const ctx = window.ko.dataFor(el);
        if (ctx) collect(ctx.$data || ctx, 'ctx', 0);
      }
    } catch {}

    return out;
  });

  console.log('=== Schedule page — venue/theater/hall observables ===');
  console.log('Observables:');
  for (const [k, v] of Object.entries(vm2.observables || {})) console.log('  ' + k + ' = ' + v);
  console.log('Nested venue/theater arrays:');
  for (const [k, v] of Object.entries(vm2.nested || {})) console.log('  ' + k + ' = ' + v);

  console.log('\n=== Schedule page — network API calls ===');
  [...new Set(api2)].forEach((c) => console.log('  ' + c));

  await browser.close();
  console.log('\n🏁 Done.');
}

probe().catch((e) => { console.error('❌', e); process.exit(1); });

