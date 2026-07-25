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

export type ChainId = 'cinema-city' | 'yes-planet' | 'lev' | 'hot-cinema' | 'indie';

export interface CinemaChain {
  id: ChainId;
  name: string;
  shortName: string;
  color: string;
}

export type HallType = 'רגיל' | 'VIP' | 'IMAX' | '4DX' | 'ScreenX';
export type Language = 'עברית' | 'אנגלית' | 'רוסית' | 'ערבית' | 'צרפתית';

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
  name: string;
  chain: ChainId;
  city: string;
}

export interface Screening {
  id: string;
  movieId: string;
  cinemaId: string;
  date: string; // ISO date
  time: string; // HH:MM
  hallType: HallType;
  audioLang: Language;
  subtitleLang: Language;
  totalSeats: number;
  availableSeats: number;
  totalRows: number;
}

export const REGIONS: Region[] = [
  {
    name: 'מרכז',
    cities: ['תל אביב', 'רמת גן', 'גבעתיים', 'חולון', 'בת ים', 'פתח תקווה', 'ראשון לציון'],
  },
  {
    name: 'שרון',
    cities: ['הרצליה', 'כפר סבא', 'רעננה', 'נתניה', 'ראש העין', 'טירה'],
  },
  {
    name: 'שפלה',
    cities: ['רחובות', 'נס ציונה', 'יבנה', 'לוד', 'רמלה', 'מודיעין'],
  },
  {
    name: 'ירושלים והסביבה',
    cities: ['ירושלים', 'מעלה אדומים', 'בית שמש', 'ביתר עילית'],
  },
  {
    name: 'צפון',
    cities: ['טבריה', 'עפולה', 'נצרת', 'צפת', 'קרית שמונה', 'בית שאן'],
  },
  {
    name: 'דרום',
    cities: ['באר שבע', 'אשדוד', 'אשקלון', 'קרית גת', 'דימונה', 'אילת'],
  },
  {
    name: 'חיפה והקריות',
    cities: ['חיפה', 'חדרה', 'נשר', 'קרית אתא', 'קרית ביאליק', 'קרית מוצקין'],
  },
];

export const CHAINS: CinemaChain[] = [
  { id: 'cinema-city', name: 'סינמה סיטי', shortName: 'סינמה סיטי', color: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  { id: 'yes-planet', name: 'יס פלאנט', shortName: 'יס פלאנט', color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { id: 'lev', name: 'רשת לב', shortName: 'לב', color: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  { id: 'hot-cinema', name: 'הוט סינמה', shortName: 'הוט סינמה', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  { id: 'indie', name: 'קולנוע עצמאי', shortName: 'עצמאי', color: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
];

export const LANGUAGES: Language[] = ['עברית', 'אנגלית', 'רוסית', 'ערבית', 'צרפתית'];

export const HALL_TYPES: HallType[] = ['רגיל', 'VIP', 'IMAX', '4DX', 'ScreenX'];

export const MOVIES: Movie[] = [
  {
    id: 'm1',
    title: 'דיונה: חלק שני',
    poster: 'https://images.pexels.com/photos/3130827/pexels-photo-3130827.jpeg?auto=compress&cs=tinysrgb&w=400',
    durationMin: 166,
    rating: 8.5,
    genre: 'מדע בדיוני',
  },
  {
    id: 'm2',
    title: 'האופטימיסטים',
    poster: 'https://images.pexels.com/photos/7234253/pexels-photo-7234253.jpeg?auto=compress&cs=tinysrgb&w=400',
    durationMin: 124,
    rating: 7.9,
    genre: 'דרמה',
  },
  {
    id: 'm3',
    title: 'מהיר ועצבני 11',
    poster: 'https://images.pexels.com/photos/3806288/pexels-photo-3806288.jpeg?auto=compress&cs=tinysrgb&w=400',
    durationMin: 141,
    rating: 7.4,
    genre: 'פעולה',
  },
  {
    id: 'm4',
    title: 'המפקח',
    poster: 'https://images.pexels.com/photos/2873486/pexels-photo-2873486.jpeg?auto=compress&cs=tinysrgb&w=400',
    durationMin: 138,
    rating: 8.1,
    genre: 'מתח',
  },
  {
    id: 'm5',
    title: 'אורות העיר',
    poster: 'https://images.pexels.com/photos/2097425/pexels-photo-2097425.jpeg?auto=compress&cs=tinysrgb&w=400',
    durationMin: 109,
    rating: 7.7,
    genre: 'רומנטיקה',
  },
  {
    id: 'm6',
    title: 'מבוך הצללים',
    poster: 'https://images.pexels.com/photos/3052361/pexels-photo-3052361.jpeg?auto=compress&cs=tinysrgb&w=400',
    durationMin: 132,
    rating: 8.3,
    genre: 'אימה',
  },
  {
    id: 'm7',
    title: 'החוף האחרון',
    poster: 'https://images.pexels.com/photos/3601425/pexels-photo-3601425.jpeg?auto=compress&cs=tinysrgb&w=400',
    durationMin: 118,
    rating: 7.6,
    genre: 'הרפתקה',
  },
  {
    id: 'm8',
    title: 'קוד שבירה',
    poster: 'https://images.pexels.com/photos/60504/desk-workspace-programming-60504.jpeg?auto=compress&cs=tinysrgb&w=400',
    durationMin: 127,
    rating: 8.0,
    genre: 'מתח',
  },
];

const CINEMAS: Cinema[] = [
  { id: 'c1', name: 'סינמה סיטי גלילות', chain: 'cinema-city', city: 'תל אביב' },
  { id: 'c2', name: 'סינמה סיטי ירושלים', chain: 'cinema-city', city: 'ירושלים' },
  { id: 'c3', name: 'סינמה סיטי חיפה', chain: 'cinema-city', city: 'חיפה' },
  { id: 'c4', name: 'סינמה סיטי באר שבע', chain: 'cinema-city', city: 'באר שבע' },
  { id: 'c5', name: 'יס פלאנט ראשון', chain: 'yes-planet', city: 'ראשון לציון' },
  { id: 'c6', name: 'יס פלאנט תל אביב', chain: 'yes-planet', city: 'תל אביב' },
  { id: 'c7', name: 'יס פלאנט חיפה', chain: 'yes-planet', city: 'חיפה' },
  { id: 'c8', name: 'יס פלאנט ירושלים', chain: 'yes-planet', city: 'ירושלים' },
  { id: 'c9', name: 'לב דימונה', chain: 'lev', city: 'דימונה' },
  { id: 'c10', name: 'לב אשדוד', chain: 'lev', city: 'אשדוד' },
  { id: 'c11', name: 'לב נתניה', chain: 'lev', city: 'נתניה' },
  { id: 'c12', name: 'הוט סינמה הרצליה', chain: 'hot-cinema', city: 'הרצליה' },
  { id: 'c13', name: 'הוט סינמה חולון', chain: 'hot-cinema', city: 'חולון' },
  { id: 'c14', name: 'הוט סינמה באר שבע', chain: 'hot-cinema', city: 'באר שבע' },
  { id: 'c15', name: 'קולנוע סמדר תל אביב', chain: 'indie', city: 'תל אביב' },
  { id: 'c16', name: 'קולנוע תיאטרון ירושלים', chain: 'indie', city: 'ירושלים' },
  { id: 'c17', name: 'סינמה סיטי נתניה', chain: 'cinema-city', city: 'נתניה' },
  { id: 'c18', name: 'יס פלאנט אשדוד', chain: 'yes-planet', city: 'אשדוד' },
  { id: 'c19', name: 'לב חיפה', chain: 'lev', city: 'חיפה' },
  { id: 'c20', name: 'הוט סינמה ראשון', chain: 'hot-cinema', city: 'ראשון לציון' },
];

const ALL_LANGS: Language[] = ['עברית', 'אנגלית', 'רוסית', 'ערבית', 'צרפתית'];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

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

const DAY_NAMES = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'יום שבת'];

export function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const dayName = DAY_NAMES[d.getDay()];
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  return `${dayName} - ${dd}/${mm}`;
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function generateScreenings(): Screening[] {
  const dates = getUpcomingDates(7);
  const rand = seededRandom(42);
  const screenings: Screening[] = [];
  let id = 1;

  for (const cinema of CINEMAS) {
    for (const movie of MOVIES) {
      // not every cinema shows every movie
      if (rand() < 0.45) continue;
      for (const date of dates) {
        // 1-4 screenings per cinema/movie/date
        const showCount = Math.floor(rand() * 4) + 1;
        let lastHour = 10;
        for (let s = 0; s < showCount; s++) {
          const hour = lastHour + Math.floor(rand() * 3);
          const minute = (rand() < 0.5 ? 0 : 30);
          if (hour > 23) break;
          lastHour = hour + Math.ceil(movie.durationMin / 60);
          const hallType = HALL_TYPES[Math.floor(rand() * HALL_TYPES.length)];
          const audioLang = ALL_LANGS[Math.floor(rand() * 3)]; // mostly he/en/ru
          const subtitleLang = ALL_LANGS[Math.floor(rand() * 3)];
          const totalSeats = [120, 150, 180, 200, 240][Math.floor(rand() * 5)];
          const availableSeats = Math.floor(rand() * totalSeats);
          const totalRows = [10, 12, 14, 16, 18][Math.floor(rand() * 5)];
          screenings.push({
            id: `s${id++}`,
            movieId: movie.id,
            cinemaId: cinema.id,
            date,
            time: `${pad(hour)}:${pad(minute)}`,
            hallType,
            audioLang,
            subtitleLang,
            totalSeats,
            availableSeats,
            totalRows,
          });
        }
      }
    }
  }
  return screenings.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export const ALL_SCREENINGS = generateScreenings();

export function getMovie(id: string): Movie | undefined {
  return MOVIES.find((m) => m.id === id);
}

export function getCinema(id: string): Cinema | undefined {
  return CINEMAS.find((c) => c.id === id);
}

export function getChain(id: ChainId): CinemaChain | undefined {
  return CHAINS.find((c) => c.id === id);
}

export function getCityOf(cinemaId: string): string {
  return getCinema(cinemaId)?.city ?? '';
}

export function chainOf(cinemaId: string): ChainId | undefined {
  return getCinema(cinemaId)?.chain;
}
