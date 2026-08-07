/**
 * Diagnose: how many screening rows are in Supabase, and for which dates?
 * Verifies whether the DB holds all scraped days or only ~2 (which would
 * indicate the app-side 1000-row PostgREST cap is truncating results).
 *
 * Usage: node scrapers/diagnose-dates.mjs
 * Reads credentials from scrapers/.env
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('❌ Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key);
const PAGE = 1000;
const counts = {};
let total = 0;
let min = null;
let max = null;

for (let from = 0; ; from += PAGE) {
  const { data, error } = await supabase
    .from('screenings')
    .select('date_time')
    .order('date_time', { ascending: true })
    .range(from, from + PAGE - 1);

  if (error) {
    console.error('❌ Query failed:', error.message);
    process.exit(1);
  }

  const rows = data || [];
  if (rows.length === 0) break;

  for (const row of rows) {
    const d = String(row.date_time).slice(0, 10);
    counts[d] = (counts[d] || 0) + 1;
    total++;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }

  if (rows.length < PAGE) break;
}

console.log(`Total rows in DB: ${total}`);
console.log(`Date range: ${min} → ${max}`);
console.log('\nRows per date:');
Object.keys(counts)
  .sort()
  .forEach((k) => console.log(`  ${k}: ${counts[k]}`));

