/**
 * Probes the language patterns in movie names and the EventsFlat VenueType field.
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
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2000));

  // 1. Analyze language patterns from movie names in the Events API
  console.log('=== Language patterns from movie names ===');
  const data = await page.evaluate(async () => {
    const res = await fetch('/tickets/Events?TheatreId=1170&VenueTypeId=0&MovieId=0&Date=0', {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return await res.json();
  });

  if (data && Array.isArray(data)) {
    const languagePatterns = {};
    for (const movie of data) {
      const name = movie.Name || '';
      let lang = 'עברית'; // default
      if (name.includes('מדובב לרוסית')) lang = 'רוסית (מדובב)';
      else if (name.includes('מדובב לצרפתית')) lang = 'צרפתית (מדובב)';
      else if (name.includes('אנגלית') || name.includes('(לייב אקשן)')) lang = 'אנגלית';
      else if (name.includes('מדובב')) lang = 'עברית (מדובב)';
      else if (name.includes('מתורגם')) lang = 'אנגלית (מתורגם)';

      if (!languagePatterns[lang]) languagePatterns[lang] = [];
      if (languagePatterns[lang].length < 5) {
        languagePatterns[lang].push(name);
      }
    }
    for (const [lang, examples] of Object.entries(languagePatterns)) {
      console.log(`\n${lang}:`);
      examples.forEach((ex) => console.log(`  - ${ex}`));
    }
  }

  // 2. Analyze VenueType in EventsFlat
  console.log('\n\n=== EventsFlat VenueType values ===');
  const flatData = await page.evaluate(async () => {
    const res = await fetch('/tickets/EventsFlat?TheatreId=1170&VenueTypeId=0&MovieId=0&Date=0', {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return await res.json();
  });

  if (flatData && Array.isArray(flatData)) {
    const venueTypes = {};
    for (const item of flatData) {
      const vt = item.VenueType || '(empty)';
      if (!venueTypes[vt]) venueTypes[vt] = 0;
      venueTypes[vt]++;
    }
    console.log('VenueType distribution:');
    for (const [vt, count] of Object.entries(venueTypes)) {
      console.log(`  "${vt}": ${count} items`);
    }
    // Show a few items with non-empty VenueType
    const withVenue = flatData.filter((f) => f.VenueType);
    if (withVenue.length > 0) {
      console.log(`\nItems WITH VenueType (${withVenue.length} total):`);
      withVenue.slice(0, 5).forEach((item) => {
        console.log(`  ${item.Name} → VenueType: "${item.VenueType}"`);
      });
    }

    // Check VenueTypeId=3 (only 4 movies returned earlier)
    console.log('\n\n=== VenueTypeId=3 check ===');
    const vipData = await page.evaluate(async () => {
      const res = await fetch('/tickets/Events?TheatreId=1170&VenueTypeId=3&MovieId=0&Date=0', {
        credentials: 'include',
      });
      if (!res.ok) return null;
      return await res.json();
    });
    if (vipData && Array.isArray(vipData)) {
      console.log(`VenueTypeId=3 returned ${vipData.length} movies:`);
      vipData.forEach((m) => console.log(`  - ${m.Name}`));
    }
  }

  await browser.close();
}

probe().catch(console.error);
