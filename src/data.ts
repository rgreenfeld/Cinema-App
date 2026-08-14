import type { SupabaseScreeningRow } from '@/lib/supabase';
import { getCinemaLocation } from '@/utils/cinemaMapping';
import { normalizeMovieTitle } from '@/utils/normalizeMovieTitle';

export type ChainId = 'cinema-city' | 'yes-planet' | 'lev' | 'hot-cinema' | 'indie';

export interface CinemaChain {
  id: ChainId;
  name: string;
  shortName: string;
  color: string;
}

export type HallType = 'רגיל' | 'VIP' | 'IMAX' | '4DX' | 'ScreenX' | '3D' | 'Onyx' | 'קומפורט';
export type Language = 'עברית' | 'אנגלית' | 'רוסית' | 'ערבית' | 'צרפתית' | 'מקור' | 'מדובב';

export interface Movie {
  id: string;
  title: string;
  poster: string;
  durationMin: number;
  rating: number;
  genre: string;
}

export interface Cinema {
  id: string;
  name: string; // Full branch name — preserved for display (e.g. "סינמה סיטי גלילות")
  chain: ChainId;
  city: string; // Derived from cinemaMapping (e.g. "רמת השרון")
  region: string; // Derived from cinemaMapping (e.g. "מרכז")
}

export interface Screening {
  id: string;
  movieId: string;
  cinemaId: string;
  date: string; // ISO date
  time: string; // HH:MM
  hallType: HallType;
  audioLang: Language;
  /** Subtitle language — null when the DB record doesn't provide it. */
  subtitleLang: Language | null;
  /** Total seats in the hall — null when not available for this screening. */
  totalSeats: number | null;
  /** Available seats — null when not available for this screening. */
  availableSeats: number | null;
  /** Number of rows in the hall — null when not available for this screening. */
  totalRows: number | null;
  /** Official booking/seat-selection URL for this screening — null when missing. */
  bookingUrl: string | null;
}

const MOVIE_POSTER =
  'https://images.pexels.com/photos/3130827/pexels-photo-3130827.jpeg?auto=compress&cs=tinysrgb&w=400';

function canonicalMovieTitle(rawTitle: string | null | undefined): string {
  const normalized = normalizeMovieTitle(rawTitle || '').cleanTitle;
  const fallback = (rawTitle || '').trim();
  return normalized || fallback;
}

function movieIdFromTitle(rawTitle: string | null | undefined): string {
  const title = canonicalMovieTitle(rawTitle);
  return `supa-m-${title.replace(/\s+/g, '-').replace(/[^א-ת\w-]/g, '')}`;
}

function mapCinemaChainToId(chainValue: string): ChainId {
  const v = (chainValue || '').trim().toLowerCase();
  if (v === 'planet' || v === 'yes planet' || v === 'yes-planet' || v === 'יס פלאנט') return 'yes-planet';
  if (v === 'cinema city' || v === 'cinema-city' || v === 'סינמה סיטי') return 'cinema-city';
  if (v === 'lev' || v === 'רשת לב' || v === 'לב') return 'lev';
  if (v === 'hot cinema' || v === 'hot-cinema' || v === 'הוט סינמה') return 'hot-cinema';
  return 'indie';
}

function normalizeHallType(value: string | null | undefined): HallType {
  const raw = (value || '').trim();
  if (!raw) return 'רגיל';
  if (raw.toLowerCase() === 'regular') return 'רגיל';
  return raw as HallType;
}

/**
 * Convert an array of unique movie titles (as fetched from Supabase) into
 * the app's `Movie[]` shape, using the same defaults as `transformSupabaseRows`.
 */
export function titlesToMovies(titles: string[]): Movie[] {
  return titles.map((title) => {
    const canonicalTitle = canonicalMovieTitle(title);
    return {
    id: movieIdFromTitle(canonicalTitle),
    title: canonicalTitle,
    poster: MOVIE_POSTER,
    durationMin: 120,
    rating: 7.5,
    genre: 'סרט',
  };
  });
}

// ─── Supabase data transformation ──────────────────────────────────────────

/**
 * Convert a UTC ISO string from Supabase to Israel local date/time parts.
 * Returns a virtualMinutes for late-night sorting (00:00-03:59 → +24h).
 */
function utcIsoToIsraelLocal(utcIso: string): { date: string; time: string; virtualMinutes: number } {
  const d = new Date(utcIso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;

  const date = `${map.year}-${map.month}-${map.day}`;
  const hour = parseInt(map.hour, 10);
  const minute = parseInt(map.minute, 10);
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  // Late-night (00:00–03:59) → virtual +24h so they sort AFTER 23:59
  const virtualMinutes = hour < 4 ? (hour + 24) * 60 + minute : hour * 60 + minute;

  return { date, time, virtualMinutes };
}

/**
 * Transform raw Supabase screening rows into the app's `Screening[]`,
 * along with derived `Movie[]` and `Cinema[]` arrays.
 */
export function transformSupabaseRows(
  supabaseRows: SupabaseScreeningRow[]
): { screenings: Screening[]; movies: Movie[]; cinemas: Cinema[] } {
  const movieMap = new Map<string, Movie>();
  const cinemaMap = new Map<string, Cinema>();
  const screenings: Screening[] = [];

  for (const row of supabaseRows) {
    const { date, time } = utcIsoToIsraelLocal(row.date_time);
    const normalizedTitle = canonicalMovieTitle(row.clean_title || row.movie_title);

    // Derive a stable movie ID from the title
    const movieId = movieIdFromTitle(normalizedTitle);
    if (!movieMap.has(movieId)) {
      movieMap.set(movieId, {
        id: movieId,
        title: normalizedTitle,
        poster: 'https://images.pexels.com/photos/3130827/pexels-photo-3130827.jpeg?auto=compress&cs=tinysrgb&w=400',
        durationMin: 120,
        rating: 7.5,
        genre: 'סרט',
      });
    }

    // Derive a stable cinema ID from the branch name
    const branchSlug = row.branch.replace(/\s+/g, '-').replace(/[^א-ת\w-]/g, '');
    const cinemaId = `supa-c-${branchSlug}`;
    if (!cinemaMap.has(cinemaId)) {
      // Resolve city/region from the cinema branch mapping. The full branch
      // name is preserved verbatim for display (e.g. "סינמה סיטי גלילות").
      const { city, region } = getCinemaLocation(row.branch);
      cinemaMap.set(cinemaId, {
        id: cinemaId,
        name: row.branch,
        chain: mapCinemaChainToId(row.cinema_chain),
        city,
        region,
      });
    }

    screenings.push({
      id: `supa-s-${row.id}`,
      movieId,
      cinemaId,
      date,
      time,
      hallType: normalizeHallType(row.screen_type),
      audioLang: (row.language || 'מקור') as Language,
      subtitleLang: null,
      totalSeats: row.total_seats ?? null,
      availableSeats: row.available_seats ?? null,
      totalRows: row.total_rows ?? null,
      bookingUrl: row.booking_url ?? null,
    });
  }

  // Sort by (date, virtualMinutes) so late-night (00:00-03:59) screenings
  // appear at the END of their day's list (after 23:59), while still
  // displaying their actual clock time (e.g. 00:15).
  const utcByScreeningId = new Map(
    supabaseRows.map((r) => [`supa-s-${r.id}`, r.date_time])
  );
  const localInfoMap = new Map(
    screenings.map((s) => {
      const { date, time, virtualMinutes } = utcIsoToIsraelLocal(
        utcByScreeningId.get(s.id) || ''
      );
      return [s.id, { date, time, virtualMinutes }];
    })
  );
  screenings.sort((a, b) => {
    const ai = localInfoMap.get(a.id)!;
    const bi = localInfoMap.get(b.id)!;
    if (ai.date !== bi.date) return ai.date.localeCompare(bi.date);
    return ai.virtualMinutes - bi.virtualMinutes;
  });

  return {
    screenings,
    movies: Array.from(movieMap.values()),
    cinemas: Array.from(cinemaMap.values()),
  };
}

