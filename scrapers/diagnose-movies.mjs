/**
 * Diagnose: what real movie fields exist in Supabase?
 *   - Does the `movies` table exist and is poster_url populated?
 *   - Does the `screenings` table carry poster_url?
 *   - Are there any rating / duration / genre columns anywhere?
 * Run from the scrapers dir so `dotenv` loads scrapers/.env.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const key = serviceKey || anonKey;

if (!url || !key) {
  console.error('❌ Missing SUPABASE_* env vars in .env');
  process.exit(1);
}
const supabase = createClient(url, key);

async function head(table) {
  const { data, error } = await supabase.from(table).select('*').limit(3);
  return { data, error };
}

// movies table
console.log('=== movies table ===');
const movies = await head('movies');
if (movies.error) {
  console.log('❌ movies table:', movies.error.message);
} else {
  console.log('Rows sample:', JSON.stringify(movies.data, null, 2));
  const { data, error } = await supabase
    .from('movies')
    .select('title, poster_url')
    .limit(1000);
  const total = data?.length ?? 0;
  const withPoster = (data || []).filter((m) => m.poster_url).length;
  const sample = (data || []).filter((m) => m.poster_url)[0];
  console.log(`Count (first 1000): ${total}, with poster: ${withPoster}`);
  console.log('Sample with poster:', JSON.stringify(sample));
}

console.log('\n=== screenings table: poster_url present? ===');
const scr = await head('screenings');
if (scr.error) {
  console.log('❌ screenings:', scr.error.message);
} else {
  const sample = scr.data[0];
  console.log('Sample screening keys:', sample ? Object.keys(sample).join(', ') : '(none)');
  console.log('Sample record:', JSON.stringify(sample, null, 2));
}
process.exit(0);

