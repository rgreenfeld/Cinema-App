/**
 * Probes additional details: movie page HTML for language/screen type info,
 * and the booking page for hall/seat layout metadata.
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
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2000));

  // 1. Try the Events endpoint with different parameters
  console.log('=== Events with VenueTypeId variations ===');
  for (const vt of [1, 2, 3, 4, 5]) {
    const data = await page.evaluate(async (venueType) => {
      const res = await fetch(`/tickets/Events?TheatreId=1170&VenueTypeId=${venueType}&MovieId=0&Date=0`, {
        credentials: 'include',
      });
      if (!res.ok) return null;
      return await res.json();
    }, vt);
    if (data && Array.isArray(data) && data.length > 0) {
      const movie = data[0];
      console.log(`VenueTypeId=${vt}: ${data.length} movies, first movie keys: ${Object.keys(movie).join(', ')}`);
      if (movie.Dates && movie.Dates.length > 0) {
        console.log(`  Date keys: ${Object.keys(movie.Dates[0]).join(', ')}`);
      }
    } else {
      console.log(`VenueTypeId=${vt}: no data`);
    }
  }

  // 2. Try to find a "GetDatesByTheater" endpoint
  console.log('\n=== GetDatesByTheater ===');
  const datesByTheater = await page.evaluate(async () => {
    const res = await fetch('/tickets/GetDatesByTheater?theaterId=1170', {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return await res.json();
  });
  if (datesByTheater) {
    console.log('Response:', JSON.stringify(datesByTheater).slice(0, 500));
  } else {
    console.log('No response');
  }

  // 3. Check if there's a dedicated events endpoint with event details
  console.log('\n=== GetEvent or EventDetails endpoint ===');
  // Try the first event from our data (Spider-Man)
  const eventDetail = await page.evaluate(async () => {
    // Try common endpoints
    const endpoints = [
      `/tickets/GetEvent?eventId=814050`,
      `/tickets/EventDetails?eventId=814050`,
      `/tickets/GetShowtime?eventId=814050`,
      `/api/tickets/event/814050`,
    ];
    const results = [];
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, { credentials: 'include' });
        if (res.ok) {
          const text = await res.text();
          results.push({ endpoint: ep, text: text.slice(0, 500) });
        } else {
          results.push({ endpoint: ep, status: res.status });
        }
      } catch (e) {
        results.push({ endpoint: ep, error: e.message });
      }
    }
    return results;
  });
  eventDetail.forEach((r) => {
    console.log(`  ${r.endpoint}:`, r.text || `status=${r.status}` || r.error);
  });

  // 4. Check the movie page HTML for language/screen type metadata
  console.log('\n=== Movie page data attributes ===');
  const moviePageData = await page.evaluate(async () => {
    // Navigate to a specific movie page
    const res = await fetch('/he/movie/%D7%A1%D7%A4%D7%99%D7%99%D7%93%D7%A8%D7%9E%D7%9F-%D7%99%D7%95%D7%9D-%D7%97%D7%93%D7%A9', {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Extract any data- attributes or JSON-LD
    const dataAttrs = html.match(/data-[a-zA-Z-]+="[^"]*"/g) || [];
    const jsonld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
    return {
      dataAttrs: dataAttrs.slice(0, 30),
      jsonld: jsonld.slice(0, 3).map(s => {
        const m = s.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        return m ? JSON.parse(m[1]) : null;
      }).filter(Boolean),
    };
  });
  if (moviePageData) {
    console.log('Data attributes found:', moviePageData.dataAttrs.length);
    moviePageData.dataAttrs.slice(0, 10).forEach(a => console.log('  ', a));
    console.log('JSON-LD found:', moviePageData.jsonld.length);
    moviePageData.jsonld.forEach(j => console.log('  ', JSON.stringify(j).slice(0, 300)));
  }

  // 5. Check the actual screening page (order page) for available data
  console.log('\n=== Order page for event 814050 ===');
  const orderData = await page.evaluate(async () => {
    const res = await fetch('/order/?eventID=814050&theaterId=1170', {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Look for hall/screen names, language info
    const matches = [];
    const patterns = ['אולם', 'screen', 'Screen', 'hall', 'Hall', 'VIP', '4DX', 'IMAX', '2D', '3D', 'שפה', 'Language', 'כתוביות', 'Subtitles', 'מדובב', 'Dubbed'];
    for (const p of patterns) {
      const regex = new RegExp(`[^.]*${p}[^.]*\\.`, 'gi');
      const found = html.match(regex);
      if (found) matches.push(...found.map(f => f.trim()).slice(0, 3));
    }
    return matches.slice(0, 20);
  });
  if (orderData) {
    console.log('Order page context matches:');
    orderData.forEach(m => console.log('  ', m));
  }

  await browser.close();
}

probe().catch(console.error);
