/**
 * Query the distinct screen_type values currently in the Supabase
 * `screenings` table, with counts. Paginates through ALL rows so the
 * result isn't capped at Supabase's default 1000-row limit.
 * Reads credentials from scrapers/.env.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const key = serviceKey || anonKey;

if (!url || !key) {
  console.error('❌ Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

const PAGE = 1000;
const counts = {};
let total = 0;

for (let from = 0; ; from += PAGE) {
  const { data, error } = await supabase
    .from('screenings')
    .select('screen_type')
    .order('id', { ascending: true }) // stable ordering so pagination doesn't drift
    .range(from, from + PAGE - 1);

  if (error) {
    console.error('❌ Query failed:', error.message);
    process.exit(1);
  }

  const rows = data || [];
  if (rows.length === 0) break;

  for (const row of rows) {
    const t = row.screen_type ?? '(null)';
    counts[t] = (counts[t] || 0) + 1;
    total++;
  }

  if (rows.length < PAGE) break; // last page
}

console.log(`Total rows scanned: ${total}\n`);
console.log('Distinct screen_type values:');
for (const [type, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  "${type}": ${count}`);
}
