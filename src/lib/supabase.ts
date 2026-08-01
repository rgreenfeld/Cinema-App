import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠ VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY are not set in .env.\n' +
      '   The app will fall back to mock data. To connect to Supabase, add:\n' +
      '   VITE_SUPABASE_URL=https://your-project.supabase.co\n' +
      '   VITE_SUPABASE_ANON_KEY=your-anon-key'
  );
}

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

export type SupabaseScreeningRow = {
  id: string;
  movie_title: string;
  cinema_chain: string;
  branch: string;
  date_time: string;
  booking_url: string | null;
  language: string;
  screen_type: string;
  created_at: string;
  /** Optional seat / row metrics — null when not scraped/available for a screening. */
  available_seats?: number | null;
  total_seats?: number | null;
  total_rows?: number | null;
};

/**
 * Fetch all screenings from the `screenings` table.
 * Ordered by date_time ascending.
 */
export async function fetchScreenings(): Promise<SupabaseScreeningRow[]> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return [];
  }

  const { data, error } = await supabase
    .from('screenings')
    .select('*')
    .order('date_time', { ascending: true });

  if (error) {
    console.error('❌ Supabase query failed:', error.message);
    return [];
  }

  return (data as SupabaseScreeningRow[]) || [];
}

/**
 * Fetch screenings for a specific date (ISO date string, e.g. "2026-08-01").
 * Uses a date range filter on the timestamptz column.
 */
export async function fetchScreeningsByDate(date: string): Promise<SupabaseScreeningRow[]> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return [];
  }

  const { start, end } = israelDateToUtcRange(date);

  const { data, error } = await supabase
    .from('screenings')
    .select('*')
    .gte('date_time', start)
    .lte('date_time', end)
    .order('date_time', { ascending: true });

  if (error) {
    console.error('❌ Supabase query failed:', error.message);
    return [];
  }

  return (data as SupabaseScreeningRow[]) || [];
}

/**
 * Convert an Israel-local calendar date (e.g. "2026-08-01") into the UTC
 * start/end timestamps that bound that full day in Asia/Jerusalem.
 *
 * This is timezone-aware (accounts for DST) and must be used when filtering
 * the `timestamptz` `date_time` column by a date the user picks in Israel.
 */
export function israelDateToUtcRange(date: string): { start: string; end: string } {
  // Noon Israel time on the target date — safe from any DST boundary.
  const noonLocal = new Date(`${date}T12:00:00`);
  const noonIso = noonLocal.toISOString();

  // Ask the JS Intl formatter what that instant looks like in Israel.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(noonIso));
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;

  const noonWall = Date.UTC(
    +map.year,
    +map.month - 1,
    +map.day,
    +map.hour,
    +map.minute,
    +map.second
  );
  const offsetMinutes = (noonWall - new Date(noonIso).getTime()) / 60000;

  // 00:00 Israel local = the instant minus offset; 23:59:59.999 = start + 24h - 1ms.
  const startMs = new Date(noonIso).getTime() - offsetMinutes * 60000;
  const dayStart = new Date(startMs).toISOString();
  const dayEnd = new Date(startMs + 24 * 60 * 60 * 1000 - 1).toISOString();

  return { start: dayStart, end: dayEnd };
}

/**
 * Fetch the unique movie titles screening in the given full cinema branch
 * names — either on a specific Israel-local date, or for all future/today
 * screenings when no date is specified.
 *
 * @param branches Full cinema branch names (mapping keys, e.g. "סינמה סיטי גלילות").
 * @param date     Optional Israel-local date (ISO "YYYY-MM-DD", e.g. "2026-08-01").
 *                 When omitted, all screenings from the start of today onward
 *                 (future + today) are included for the given cinemas.
 */
export async function fetchMoviesByBranchesAndDate(
  branches: string[],
  date?: string
): Promise<string[]> {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠ Supabase env vars not set — skipping movies query.');
    return [];
  }

  // Format the date explicitly as DD/MM/YYYY — matching the date format
  // shown in our DB output (e.g. "01/08/2026").
  const formattedDate = toDDMMYYYY(date ?? todayInIsrael());

  // Log the active query parameters.
  console.log('Querying Supabase with cinemas:', branches, 'and date:', formattedDate);

  let query = supabase.from('screenings').select('movie_title');

  // Filter by the mapped cinema names. The schema column that holds the full
  // cinema branch names is `branch` (e.g. "סינמה סיטי גלילות"). An empty
  // branch list means no cinema filter (e.g. "current location" mode).
  if (branches.length > 0) {
    query = query.in('branch', branches);
  }

  if (date) {
    // Specific date → full day in the Israel-local timezone (UTC bounds).
    const { start, end } = israelDateToUtcRange(date);
    query = query.gte('date_time', start).lte('date_time', end);
  } else {
    // No date specified → all future/today screenings for those cinemas
    // (from the start of today in Israel onward).
    const { start } = israelDateToUtcRange(todayInIsrael());
    query = query.gte('date_time', start);
  }

  const { data, error } = await query;

  if (error) {
    console.error('❌ Supabase movies query failed:', error.message);
    return [];
  }

  // Unique, sorted movie titles.
  const unique = new Set<string>();
  for (const row of data || []) {
    if (row.movie_title) unique.add(row.movie_title);
  }
  return Array.from(unique).sort((a, b) => a.localeCompare(b, 'he'));
}

/**
 * Today's date in Israel (Asia/Jerusalem), as an ISO date string
 * (e.g. "2026-08-01").
 */
export function todayInIsrael(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Convert an ISO date ("YYYY-MM-DD") to an explicit DD/MM/YYYY string
 * (e.g. "2026-08-01" → "01/08/2026").
 * Inputs that are already "DD/MM/YYYY" are returned unchanged.
 */
export function toDDMMYYYY(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day || day.length !== 2) return isoDate;
  return `${day}/${month}/${year}`;
}

/**
 * Today's date in Israel (Asia/Jerusalem), formatted as DD/MM/YYYY
 * (e.g. "01/08/2026") — matching the date format shown in our DB output.
 */
export function todayInIsraelDDMMYYYY(): string {
  return toDDMMYYYY(todayInIsrael());
}
