import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const TABLE = process.env.SUPABASE_SCREENINGS_TABLE || 'screenings';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('❌ Missing Supabase credentials.');
  console.error('   Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).');
  process.exit(1);
}

const supabase = createClient(url, key);

async function pruneOldScreenings() {
  const nowISO = new Date().toISOString();
  console.log(`🧹 Pruning screenings older than ${nowISO} from "${TABLE}"...`);

  const { count: outdatedCount, error: countError } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .lt('date_time', nowISO);

  if (countError) {
    console.error('❌ Failed to count outdated screenings:', countError.message);
    process.exit(1);
  }

  console.log(`   Found ${outdatedCount ?? 0} outdated screening(s).`);

  const { error: deleteError, count: deletedCount } = await supabase
    .from(TABLE)
    .delete({ count: 'exact' })
    .lt('date_time', nowISO);

  if (deleteError) {
    console.error('❌ Failed to prune outdated screenings:', deleteError.message);
    process.exit(1);
  }

  if ((outdatedCount ?? 0) > 0 && deletedCount === 0) {
    console.error('⚠️  DELETE ran but removed 0 rows even though outdated screenings exist.');
    console.error('   Use SUPABASE_SERVICE_ROLE_KEY or add a DELETE policy.');
    process.exit(1);
  }

  console.log(`   ✓ Outdated screenings pruned (${deletedCount ?? 0} row(s) removed).`);
}

pruneOldScreenings().catch((err) => {
  console.error('❌ Fatal prune error:', err.message);
  process.exit(1);
});