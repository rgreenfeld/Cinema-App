import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  MapPin,
  Armchair,
  Layers,
  Volume2,
  ExternalLink,
  Calendar,
  SearchX,
  Loader2,
} from 'lucide-react';
import {
  CHAINS,
  formatDateLabel,
  formatShortDate,
} from '@/constants';
import {
  type Screening,
  type Movie,
  type Cinema,
  type ChainId,
} from '@/data';
import type { Preferences, SearchCriteria } from '@/types';
import { virtualMinutesOf, timeToMinutes, nowIsraelMinutes } from '@/timeUtils';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { seatAvailabilityFromRecord } from '@/lib/seatAvailability';
import { todayInIsrael } from '@/lib/supabase';

const ORIGINAL_LANGUAGE_GROUP = new Set(['מקור', 'עברית', 'אנגלית', 'מקור עם כתוביות']);

function matchesSelectedLanguageFilter(
  selectedLanguages: Preferences['selectedLanguages'],
  audioLang: Screening['audioLang'],
  isDubbed: Screening['isDubbed']
): boolean {
  if (selectedLanguages.length === 0) return true;

  return selectedLanguages.some((selected) => {
    if (selected === 'שפת מקור') {
      return ORIGINAL_LANGUAGE_GROUP.has(audioLang);
    }
    if (selected === 'מדובב') {
      return isDubbed && audioLang === 'עברית';
    }
    return selected === audioLang;
  });
}

interface Props {
  criteria: SearchCriteria;
  preferences: Preferences;
  onChange: () => void;
  onCriteriaChange: (criteria: SearchCriteria) => void;
  screenings?: Screening[];
  movies?: Movie[];
  cinemas?: Cinema[];
}

const PAGE_SIZE = 10;

// Chain display helpers — resolve ChainId → badge styles/label using constants
function chainDataColor(chainId: ChainId): string {
  const chain = CHAINS.find((c) => c.id === chainId);
  return chain?.color ?? 'bg-gray-500/15 text-gray-300 border-gray-500/30';
}

function chainDataShortName(chainId: ChainId): string {
  const chain = CHAINS.find((c) => c.id === chainId);
  return chain?.shortName ?? chainId;
}

export function ResultsScreen({ criteria, preferences, onChange, onCriteriaChange, screenings: propScreenings, movies: propMovies, cinemas: propCinemas }: Props) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);

  const screeningSource = propScreenings ?? [];

  const results = useMemo(() => filterScreenings(criteria, preferences, screeningSource, propCinemas), [criteria, preferences, screeningSource, propCinemas]);

  const visible = results.slice(0, visibleCount);
  const hasMore = visibleCount < results.length;

  const loadMore = () => {
    if (loading) return;
    setLoading(true);
    setTimeout(() => {
      setVisibleCount((c) => c + PAGE_SIZE);
      setLoading(false);
    }, 500);
  };

  const sentinelRef = useInfiniteScroll(loadMore, hasMore, loading);

  const selectedMovie = criteria.movieId
    ? propMovies?.find((m) => m.id === criteria.movieId)
    : undefined;
  const dateLabel = criteria.date ? formatDateLabel(criteria.date) : '';
  const dateOptions = useMemo(() => {
    if (criteria.mode !== 'movie' || !criteria.movieId) return [];

    const cinemaById = new Map((propCinemas ?? []).map((cinema) => [cinema.id, cinema]));
    const availableDates = new Set<string>();

    for (const screening of screeningSource) {
      if (screening.movieId !== criteria.movieId) continue;
      if (screening.date < todayInIsrael()) continue;

      const cinema = cinemaById.get(screening.cinemaId);
      if (!cinema) continue;
      if (preferences.selectedChains.length > 0 && !preferences.selectedChains.includes(cinema.chain)) continue;
      if (
        preferences.locationMode === 'regions' &&
        preferences.selectedBranches.length > 0 &&
        !preferences.selectedBranches.includes(cinema.name)
      ) {
        continue;
      }

      availableDates.add(screening.date);
    }

    return Array.from(availableDates).sort((first, second) => first.localeCompare(second));
  }, [criteria.mode, criteria.movieId, preferences.locationMode, preferences.selectedBranches, preferences.selectedChains, propCinemas, screeningSource]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [criteria]);

  return (
    <div className="screen-enter mx-auto max-w-3xl px-4 pb-16 pt-6">
      {/* Header context */}
      <header className="sticky top-0 z-20 -mx-4 mb-6 border-b border-white/[0.06] bg-[#0a0a0f]/95 px-4 pb-3 pt-6 backdrop-blur-md">
        <div className="cinema-card flex flex-col gap-3 p-4">
          {selectedMovie ? (
            <h1 className="text-lg font-black text-white">{selectedMovie.title}</h1>
          ) : (
            <h1 className="text-lg font-black text-white">כל הסרטים בטווח השעות שנבחר</h1>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {criteria.mode === 'time' && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Calendar className="h-3.5 w-3.5" />
                  {dateLabel}
                </div>
              )}
              {(criteria.minTime || criteria.maxTime) && (
                <p className="mt-0.5 text-xs text-gray-500">
                  {criteria.minTime && `מ-${criteria.minTime}`}
                  {criteria.maxTime && ` עד ${criteria.maxTime}`}
                </p>
              )}
            </div>
            {criteria.mode === 'movie' ? (
              <div className="flex shrink-0 items-center gap-2">
                <label className="relative">
                  <span className="sr-only">תאריך</span>
                  <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <select
                    value={criteria.date ?? ''}
                    onChange={(event) => onCriteriaChange({ ...criteria, date: event.target.value })}
                    className="h-11 max-w-[9.5rem] appearance-none rounded-xl border border-white/10 bg-white/[0.03] py-2 pr-9 pl-3 text-sm font-semibold text-gray-100 outline-none transition-colors hover:border-white/20 focus:border-rose-500/60 focus:ring-2 focus:ring-rose-500/20"
                  >
                    {dateOptions.map((date) => (
                      <option key={date} value={date} className="bg-[#12121a]">
                        {formatDateLabel(date)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={onChange} className="btn-primary h-11 shrink-0 px-4 py-2.5 text-sm">
                  <ChevronLeft className="h-4 w-4" />
                  חזור
                </button>
              </div>
            ) : (
              <button type="button" onClick={onChange} className="btn-primary shrink-0 px-4 py-2.5 text-sm">
                <ChevronLeft className="h-4 w-4" />
                החלף
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Count */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-400">
          <span className="font-bold text-white">{results.length}</span> תוצאות הקרנה
        </p>
        <span className="text-xs text-gray-500">מיון לפי שעת הקרנה</span>
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <div className="cinema-card flex flex-col items-center gap-3 p-12 text-center">
          <SearchX className="h-10 w-10 text-gray-600" />
          <p className="font-bold text-gray-300">לא נמצאו הקרנות תואמות</p>
          <p className="text-sm text-gray-500">נסה לשנות את הסרט, התאריך או טווח השעות.</p>
        </div>
      ) : (
        <div className="space-y-3">
{visible.map((s) => (
            <ResultCard
              key={s.id}
              screening={s}
              showMovie={criteria.mode === 'time'}
              movies={propMovies}
              cinemas={propCinemas}
            />
          ))}
        </div>
      )}

      {/* Sentinel + loader */}
      <div ref={sentinelRef} className="h-4" />
      {loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          טוען עוד תוצאות...
        </div>
      )}
      {!hasMore && results.length > 0 && (
        <p className="py-6 text-center text-xs text-gray-600">סוף התוצאות · {results.length} הקרנות</p>
      )}
    </div>
  );
}

function ResultCard({ screening, showMovie, movies, cinemas }: { screening: Screening; showMovie: boolean; movies?: Movie[]; cinemas?: Cinema[] }) {
  const [expanded, setExpanded] = useState(false);

  const movie = movies?.find((m) => m.id === screening.movieId);
  const cinema = cinemas?.find((c) => c.id === screening.cinemaId);
  const chainData = cinema?.chain;
  const city = cinema?.city ?? '';
  const hasBooking = Boolean(screening.bookingUrl);

  // Seat data is resolved directly from the values the server-side scraper
  // stored on the screening record in Supabase (available_seats/total_seats/
  // total_rows). No client-side live fetch — Cinema City's seats API is
  // reCAPTCHA-gated and returns 403 to any direct/HTTP request, so the only
  // reliable source is the pre-scraped DB data.
  const seatData = seatAvailabilityFromRecord(
    screening.availableSeats,
    screening.totalSeats,
    screening.totalRows
  );

  const hasSeats = seatData.availableSeats != null || seatData.totalSeats != null;
  const canComputeRatio =
    seatData?.availableSeats != null &&
    seatData?.totalSeats != null &&
    seatData.totalSeats > 0;
  const fillRatio = canComputeRatio ? seatData!.availableSeats! / seatData!.totalSeats! : 0;
  const availColor =
    fillRatio > 0.5 ? 'bg-emerald-500' : fillRatio > 0.2 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="cinema-card cinema-card-hover overflow-hidden">
      {/* Collapsed */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-4 p-4 text-right"
      >
        <div className="flex flex-col items-center">
          <span className="text-2xl font-black tabular-nums text-white">{screening.time}</span>
          <span className="text-[10px] text-gray-500">{formatShortDate(screening.date)}</span>
        </div>

        <div className="h-12 w-px bg-white/10" />

        <div className="min-w-0 flex-1">
          {showMovie && movie && (
            <p className="truncate text-sm font-bold text-white">{movie.title}</p>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-400">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-gray-500" />
              {city}
            </span>
            <span className="text-gray-600">·</span>
            <span className="truncate text-gray-500">{cinema?.name}</span>
          </div>

          {/* Immediate screen type + language badges (real DB values) */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <DetailBadge icon={<Layers className="h-3 w-3 text-gray-400" />} label={screening.hallType} />
            <DetailBadge icon={<Volume2 className="h-3 w-3 text-gray-400" />} label={screening.audioLang} />
            {screening.isDubbed && <DetailBadge icon={<Volume2 className="h-3 w-3 text-gray-400" />} label="מדובב" />}
          </div>

          {chainData && (
            <span
              className={`mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chainDataColor(chainData)}`}
            >
              {chainDataShortName(chainData)}
            </span>
          )}
        </div>

        <ChevronDown
          className={`h-5 w-5 shrink-0 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="expand-enter border-t border-white/[0.06] bg-black/20 p-4">
          {/* Screen type & language badges — always visible in the expanded panel too */}
          <div className="flex flex-wrap gap-2">
            <DetailBadge icon={<Layers className="h-3.5 w-3.5 text-gray-400" />} label={screening.hallType} />
            <DetailBadge icon={<Volume2 className="h-3.5 w-3.5 text-gray-400" />} label={screening.audioLang} />
            {screening.isDubbed && <DetailBadge icon={<Volume2 className="h-3.5 w-3.5 text-gray-400" />} label="מדובב" />}
            {seatData?.totalRows != null && (
              <DetailBadge
                icon={<Layers className="h-3.5 w-3.5 text-gray-400" />}
                label={`${seatData.totalRows} שורות`}
              />
            )}
          </div>

          {/* Seat availability — stored DB metrics (no client-side fetch) */}
          <div className="mt-4">
            {hasSeats ? (
              <>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-gray-300">
                    <Armchair className="h-4 w-4" />
                    מושבים פנויים
                  </span>
                  <span className="font-bold text-white">
                    {seatData?.availableSeats != null
                      ? seatData?.totalSeats != null
                        ? `${seatData.availableSeats} מתוך ${seatData.totalSeats}`
                        : `${seatData.availableSeats} פנויים`
                      : `${seatData?.totalSeats} מושבים`}
                  </span>
                </div>
                {canComputeRatio ? (
                  <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${availColor}`}
                      style={{ width: `${Math.max(fillRatio * 100, 2)}%` }}
                    />
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">
                    {seatData?.availableSeats == null
                      ? 'נתוני מושבים פנויים לא זמינים להקרנה זו'
                      : 'קיבולת האולם לא זמינה'}
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-gray-400">
                נתוני מקומות פנויים לא נמסרו להקרנה זו.
              </div>
            )}
          </div>

          {/* Booking — always linked to the real booking_url */}
          {hasBooking ? (
            <a
              href={screening.bookingUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-4 w-full text-sm"
            >
              <ExternalLink className="h-4 w-4" />
              הזמן כרטיסים
            </a>
          ) : (
            <div className="mt-4 w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center text-sm text-gray-500">
              קישור להזמנת כרטיסים לא זמין להקרנה זו
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-gray-200">
      {icon}
      {label}
    </span>
  );
}

function filterScreenings(criteria: SearchCriteria, preferences: Preferences, screenings: Screening[], cinemas?: Cinema[]): Screening[] {
  const minMin = criteria.minTime ? virtualMinutesOf(criteria.minTime) : 0;
  const maxMin = criteria.maxTime ? virtualMinutesOf(criteria.maxTime) : 24 * 60;

  // When the filter date is today, drop any screening whose start time has
  // already passed relative to the current Israel local time.
  const isToday = criteria.date === todayInIsrael();
  const nowMin = nowIsraelMinutes();

  return screenings.filter((s) => {
    // Movie filter
    if (criteria.mode === 'movie' && criteria.movieId && s.movieId !== criteria.movieId) return false;
    // Date filter
    if (criteria.date && s.date !== criteria.date) return false;
    // Language filter — empty selection means "All Languages" (no filter).
    if (!matchesSelectedLanguageFilter(preferences.selectedLanguages, s.audioLang, s.isDubbed)) {
      return false;
    }
    // Today's screenings must not already be in the past.
    if (isToday && timeToMinutes(s.time) < nowMin) return false;
    // Time filter — skip when allDay is checked
    if (!criteria.allDay) {
      const sm = virtualMinutesOf(s.time);
      if (criteria.minTime && sm < minMin) return false;
      if (criteria.maxTime && sm > maxMin) return false;
    }
    // Hall filter
    if (criteria.hallTypes.length > 0 && !criteria.hallTypes.includes(s.hallType)) return false;
    // Preferences: chains
    if (preferences.selectedChains.length > 0) {
      const c = cinemas?.find((x) => x.id === s.cinemaId)?.chain;
      if (!c || !preferences.selectedChains.includes(c)) return false;
    }
    // Preferences: locations (only in regions mode).
    // Filters by the full mapped branch names stored in selectedBranches —
    // the display names (e.g. "סינמה סיטי גלילות") are preserved verbatim.
    if (preferences.locationMode === 'regions' && preferences.selectedBranches.length > 0) {
      const branchName = cinemas?.find((x) => x.id === s.cinemaId)?.name ?? '';
      if (!preferences.selectedBranches.includes(branchName)) return false;
    }
    return true;
  }).sort((a, b) => {
    // Late-night virtual offset: 00:00-03:59 sorts at END of the day
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return virtualMinutesOf(a.time) - virtualMinutesOf(b.time);
  });
}
