/**
 * Probes the Cinema City API to discover available fields in the response
 * related to language, screen type, hall type, etc.
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
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2000));

  // Fetch API data for Glilot (theaterId=1170)
  const data = await page.evaluate(async () => {
    const res = await fetch('/tickets/Events?TheatreId=1170&VenueTypeId=0&MovieId=0&Date=0', {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return await res.json();
  });

  if (!data || !Array.isArray(data)) {
    console.log('No data returned');
    await browser.close();
    return;
  }

  console.log(`Movies in response: ${data.length}\n`);

  // Examine the first few movies and their Dates objects
  for (let mi = 0; mi < Math.min(3, data.length); mi++) {
    const movie = data[mi];
    console.log(`=== Movie ${mi + 1}: "${movie.Name}" ===`);
    console.log('Top-level keys:', Object.keys(movie).join(', '));

    // Show all keys on the first Date object
    const dates = movie.Dates || [];
    if (dates.length > 0) {
      const firstDate = dates[0];
      console.log('Date object keys:', Object.keys(firstDate).join(', '));
      console.log('Date object values:');
      for (const [key, val] of Object.entries(firstDate)) {
        console.log(`  ${key}: ${JSON.stringify(val)}`);
      }
      // Show a few more dates to see variance
      if (dates.length > 1) {
        console.log(`\nShowing keys for ${Math.min(3, dates.length)} dates:`);
        for (let di = 0; di < Math.min(3, dates.length); di++) {
          console.log(`  Date ${di}: keys = ${Object.keys(dates[di]).join(', ')}`);
        }
      }
    } else {
      console.log('No Dates array');
    }
    console.log('');
  }

  // Also check if there are other endpoints we should use
  // Try EventsFlat which might have more detail
  console.log('\n=== Trying EventsFlat endpoint ===');
  const flatData = await page.evaluate(async () => {
    const res = await fetch('/tickets/EventsFlat?TheatreId=1170&VenueTypeId=0&MovieId=0&Date=0', {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return await res.json();
  });

  if (flatData && Array.isArray(flatData) && flatData.length > 0) {
    console.log(`EventsFlat returned ${flatData.length} items`);
    const first = flatData[0];
    console.log('First item keys:', Object.keys(first).join(', '));
    console.log('First item values:');
    for (const [key, val] of Object.entries(first)) {
      if (typeof val === 'object' && val !== null) {
        console.log(`  ${key}: [object]`, JSON.stringify(val).slice(0, 200));
      } else {
        console.log(`  ${key}: ${JSON.stringify(val)}`);
      }
    }
  } else {
    console.log('EventsFlat returned nothing useful');
  }

  await browser.close();
}

probe().catch(console.error);
