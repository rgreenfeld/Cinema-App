/**
 * Fetch and inspect the Cinema City core JS files (common.js, ticketsNew2.js,
 * init.js, site.js) to discover the real venue-type / events API endpoints
 * and how the site determines hall types (Onyx, Lounge, VIP, Prime...).
 */
const BASE = 'https://www.cinema-city.co.il';
const FILES = [
  '/js/common.js?v=ynS668e0rnkbL5jSkLFXMHp0_YzNqN-NpM8sF3LVxeQ',
  '/js/ticketsNew2.js?c=2&v=jlOX0tNW9eNJ3_JrAkl-G0EJ9nHvklIV6iPNLadwm2s',
  '/js/init.js?v=yukJXrbbNRnlOfJDhMeKZR18ydTw9z0KnXCyvL4w6GQ',
  '/js/site.js?v=QADDxzBcNf0fuzcQij-lDiM_d6hpuavoA2xo031HykA',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

for (const file of FILES) {
  console.log(`\n═══════════════════════════════════════`);
  console.log(`FILE: ${file}`);
  console.log('═══════════════════════════════════════');
  try {
    const res = await fetch(BASE + file, { headers: { 'User-Agent': UA } });
    const text = await res.text();
    console.log(`Status: ${res.status}, size: ${text.length}`);

    // Find API endpoint strings.
    const endpoints = new Set();
    const m = text.match(/["'`]([^"'`]*(?:\/tickets\/|\/api\/|Events|Venue|Theater|Theatre|Get)[^"'`]*)["'`]/g) || [];
    for (const e of m) {
      const clean = e.replace(/["'`]/g, '');
      if (/Events|Venue|Theater|Theatre|Get|tickets|api/i.test(clean) && clean.length < 90) {
        endpoints.add(clean);
      }
    }
    console.log('\nEndpoint strings found:');
    [...endpoints].forEach((e) => console.log('  ', e));

    // Find venue-type / hall-type related code.
    const venueRelated = text.match(/[^;]{0,60}(VenueType|VenueName|HallName|hallName|HallType|ScreenType|Onyx|Lounge|Prime|IsVip|venuetype)[^;]{0,80}/gi) || [];
    console.log('\nVenue/hall-type related code snippets:');
    [...new Set(venueRelated)].slice(0, 40).forEach((s) => console.log('  ', s.replace(/\s+/g, ' ').trim()));

    // Find how EventsFlat / Events is called.
    const eventsRelated = text.match(/[^;]{0,50}EventsFlat[^;]{0,100}/gi) || text.match(/[^;]{0,50}Events[^;]{0,80}/gi) || [];
    console.log('\nEvents-related code snippets:');
    [...new Set(eventsRelated)].slice(0, 20).forEach((s) => console.log('  ', s.replace(/\s+/g, ' ').trim()));
  } catch (e) {
    console.log('❌ Error:', e.message);
  }
}
process.exit(0);
