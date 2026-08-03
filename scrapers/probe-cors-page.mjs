/**
 * Probe: Fetch the www.cinema-city.co.il/order/ page via regular fetch (simulating
 * what the CORS proxy would return) and inspect the HTML for embedded data.
 * 
 * This runs in Node with puppeteer to establish a session first, then fetches
 * the order page to see what the raw HTML looks like.
 */
import puppeteer from 'puppeteer';

const BASE_URL = 'https://www.cinema-city.co.il';
const EVENT_ID = '838451';
const THEATER_ID = '1170';
const ORDER_URL = `${BASE_URL}/order/?eventID=${EVENT_ID}&theaterId=${THEATER_ID}`;

async function probe() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });

  // Step 1: Visit home page to establish session
  console.log('🌐 Visiting home page...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2000));

  // Dismiss GDPR banner
  await page.evaluate(() => {
    const btn = document.querySelector('.gdpr-accept-triger');
    if (btn) btn.click();
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));

  // Step 2: Intercept the order page response to see what the raw HTML looks like
  console.log('🌐 Fetching order page with response interception...');
  
  let finalResponse = null;
  let redirectChain = [];
  
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('order') && url.includes('838451')) {
      finalResponse = { url, status: response.status(), headers: response.headers() };
      try {
        finalResponse.body = await response.text();
      } catch (e) {
        finalResponse.bodyError = e.message;
      }
    }
    if (response.status() >= 300 && response.status() < 400 && url.includes('cinema-city')) {
      redirectChain.push({ from: url, to: response.headers()['location'] || 'unknown' });
    }
  });

  await page.goto(ORDER_URL, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 3000));

  // Check if we got redirected
  console.log('\n📊 Redirect chain:', JSON.stringify(redirectChain, null, 2));
  console.log('\n📊 Final URL:', page.url());

  if (finalResponse) {
    console.log('\n📊 Order page response:');
    console.log('  Status:', finalResponse.status);
    console.log('  URL:', finalResponse.url);
    console.log('  Body length:', finalResponse.body?.length || 0);
    
    if (finalResponse.body) {
      // Search for __NUXT__ state
      const nuxtMatch = finalResponse.body.match(/__NUXT__\s*=\s*({[\s\S]*?})<\/script>/i);
      if (nuxtMatch) {
        console.log('\n📊 Found __NUXT__ state (first 2000 chars):');
        console.log(nuxtMatch[1].slice(0, 2000));
      } else {
        console.log('\n❌ No __NUXT__ state found in HTML');
        
        // Check for other data patterns
        const scriptPatterns = [
          /<script[^>]*>([\s\S]*?)<\/script>/gi,
        ];
        let scriptCount = 0;
        let m;
        while ((m = scriptPatterns[0].exec(finalResponse.body)) !== null) {
          const content = m[1].trim();
          if (content.length > 50 && !content.includes('function') && !content.includes('var ') && !content.includes('let ')) {
            scriptCount++;
            if (scriptCount <= 5) {
              console.log(`\n  Script #${scriptCount} (${content.length} chars):`, content.slice(0, 300));
            }
          }
        }
        console.log(`\n  Total non-function scripts found: ${scriptCount}`);

        // Check for meta redirect
        const metaRefresh = finalResponse.body.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*>/i);
        if (metaRefresh) {
          console.log('\n📊 Meta refresh found:', metaRefresh[0]);
        }

        // Check for iframe
        const iframe = finalResponse.body.match(/<iframe[^>]*src=["']([^"']+)["']/i);
        if (iframe) {
          console.log('\n📊 Iframe found:', iframe[1]);
        }

        // Check for window.location redirect
        const locRedirect = finalResponse.body.match(/window\.location\s*[=:]/i);
        if (locRedirect) {
          console.log('\n📊 window.location redirect found');
        }

        // Check for data-* attributes
        const dataAttrs = finalResponse.body.match(/data-[a-zA-Z-]+="[^"]*"/g);
        if (dataAttrs) {
          console.log('\n📊 Data attributes:', dataAttrs.slice(0, 20));
        }

        // Show first 1000 chars of body
        console.log('\n📊 First 1000 chars of HTML:');
        console.log(finalResponse.body.slice(0, 1000));
      }
    }
  } else {
    // The page might have redirected to tickets subdomain
    console.log('\n📊 Current page URL:', page.url());
    const html = await page.content();
    console.log('  Page title:', await page.title());
    
    // Check for Nuxt state
    const nuxt = await page.evaluate(() => {
      try {
        return window.__NUXT__ ? JSON.stringify(window.__NUXT__).slice(0, 2000) : 'No __NUXT__';
      } catch (e) {
        return 'Error: ' + e.message;
      }
    });
    console.log('  __NUXT__:', nuxt);

    // Check for presentation data
    const presData = await page.evaluate(() => {
      try {
        const scripts = document.querySelectorAll('script');
        const results = [];
        for (const s of scripts) {
          if (s.textContent && (s.textContent.includes('venueId') || s.textContent.includes('seatplanId') || s.textContent.includes('presentation'))) {
            results.push(s.textContent.slice(0, 500));
          }
        }
        return results;
      } catch (e) {
        return ['Error: ' + e.message];
      }
    });
    console.log('  Scripts with venue/seat data:', presData);
  }

  await browser.close();
}

probe().catch(console.error);
