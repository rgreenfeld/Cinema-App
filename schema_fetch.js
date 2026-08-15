const base = 'https://hotcinema.co.il';
const endpoints = [
  '/tickets/TheaterEvents',
  '/tickets/TheaterEvents2',
  '/tickets/movieevents',
  '/MovieEventsDaysFilter'
];

function getKeysAndTypes(obj, maxDepth = 2, currentDepth = 0) {
  if (!obj || typeof obj !== 'object') return typeof obj;
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return [getKeysAndTypes(obj[0], maxDepth, currentDepth + 1)];
  }
  if (currentDepth >= maxDepth) return '{...}';
  const result = {};
  for (const k of Object.keys(obj)) {
    result[k] = getKeysAndTypes(obj[k], maxDepth, currentDepth + 1);
  }
  return result;
}

(async () => {
  for (const ep of endpoints) {
    try {
      const url = base + ep;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = await res.json();
      console.log('=== Endpoint:', ep, '===');
      console.log('Status:', res.status);
      console.log('Top-Level Keys:', Object.keys(data).slice(0, 15));
      if (Array.isArray(data)) {
        console.log('Is Array. Length:', data.length);
        if (data.length > 0) {
          console.log('First item schema preview:');
          console.log(JSON.stringify(getKeysAndTypes(data[0], 4), null, 2).slice(0, 2000));
        }
      } else {
        console.log('Is Object. Keys schema:');
        console.log(JSON.stringify(getKeysAndTypes(data, 3), null, 2).slice(0, 2000));
      }
      console.log('\n');
    } catch (e) {
      console.log('Error fetching/parsing', ep, ':', e.message);
    }
  }
})();
