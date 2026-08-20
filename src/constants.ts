import type { ChainId, HallType, LanguageFilter } from '@/data';
import { CINEMA_LOCATION_MAP } from '@/utils/cinemaMapping';

export type RegionName =
  | 'מרכז'
  | 'שרון'
  | 'שפלה'
  | 'ירושלים והסביבה'
  | 'צפון'
  | 'דרום'
  | 'חיפה והקריות';

export interface Region {
  name: RegionName;
  cities: string[];
}

/**
 * Geographic regions with their cities.
 *
 * Built directly from the cinema branch mapping (`src/utils/cinemaMapping.ts`)
 * so the location selector only offers cities/regions that actually have
 * cinema branches — no fake/mock options. Each region lists the mapped
 * cities of the branches that belong to it.
 */
function buildRegions(): Region[] {
  const regionMap = new Map<string, Set<string>>();
  for (const loc of Object.values(CINEMA_LOCATION_MAP)) {
    if (!regionMap.has(loc.region)) regionMap.set(loc.region, new Set());
    regionMap.get(loc.region)!.add(loc.city);
  }
  return Array.from(regionMap.entries()).map(([name, cities]) => ({
    name: name as RegionName,
    cities: Array.from(cities),
  }));
}

export const REGIONS: Region[] = buildRegions();

/**
 * Cinema chains that the app supports.
 * This is real app configuration — not mock data.
 * In the future this could be fetched from a `chains` Supabase table.
 */
export const CHAINS: { id: ChainId; name: string; shortName: string; color: string }[] = [
  { id: 'cinema-city', name: 'סינמה סיטי', shortName: 'סינמה סיטי', color: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  { id: 'yes-planet', name: 'פלאנט', shortName: 'פלאנט', color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { id: 'lev', name: 'רשת לב', shortName: 'לב', color: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  { id: 'hot-cinema', name: 'הוט סינמה', shortName: 'הוט סינמה', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  { id: 'movieland', name: 'מובילנד', shortName: 'מובילנד', color: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30' },
  { id: 'indie', name: 'קולנוע עצמאי', shortName: 'עצמאי', color: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
];

export const LANGUAGES: LanguageFilter[] = ['שפת מקור', 'רוסית', 'ערבית', 'צרפתית', 'מדובב'];

export const HALL_TYPES: HallType[] = ['רגיל', 'VIP', 'IMAX', '4DX', 'ScreenX', '3D', 'Onyx', 'קומפורט'];

/** Sentinel value for the date select — means "all available dates" instead of one specific date. */
export const ALL_DATES_VALUE = 'all-dates';

/** Sentinel value for the start-time select — means "all screenings that day" instead of one specific time. */
export const ALL_DAY_VALUE = 'all-day';

const DAY_NAMES = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'יום שבת'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function buildDates(base: Date, count: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export function getUpcomingDates(count = 7): string[] {
  return buildDates(new Date(), count);
}

export function formatDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const dayName = DAY_NAMES[d.getDay()];
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  return `${dayName} - ${dd}/${mm}`;
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}
