import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  MapPin,
  Armchair,
  Layers,
  Volume2,
  Subtitles,
  ExternalLink,
  Calendar,
  SearchX,
  Loader2,
} from 'lucide-react';
import {
  ALL_SCREENINGS,
  getMovie,
  getCinema,
  getChain,
  chainOf,
  getCityOf,
  formatDateLabel,
  formatShortDate,
  type Screening,
} from '@/data';
import type { Preferences, SearchCriteria } from '@/types';
import { timeToMinutes } from '@/timeUtils';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

interface Props {
  criteria: SearchCriteria;
  preferences: Preferences;
  onChange: () => void;
}

const PAGE_SIZE = 10;

export function ResultsScreen({ criteria, preferences, onChange }: Props) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);

  const results = useMemo(() => filterScreenings(criteria, preferences), [criteria, preferences]);

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

  const selectedMovie = criteria.movieId ? getMovie(criteria.movieId) : undefined;
  const dateLabel = criteria.date ? formatDateLabel(criteria.date) : '';

  return (
    <div className="screen-enter mx-auto max-w-3xl px-4 pb-16 pt-6">
      {/* Header context */}
      <header className="mb-6">
        <div className="cinema-card flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Calendar className="h-3.5 w-3.5" />
              {dateLabel}
            </div>
            {selectedMovie ? (
              <h1 className="mt-1 truncate text-lg font-black text-white">{selectedMovie.title}</h1>
            ) : (
              <h1 className="mt-1 text-lg font-black text-white">כל הסרטים בטווח השעות שנבחר</h1>
            )}
            <p className="mt-0.5 text-xs text-gray-500">
              {criteria.minTime && `מ-${criteria.minTime}`}
              {criteria.maxTime && ` עד ${criteria.maxTime}`}
              {criteria.hallTypes.length > 0 && ` · ${criteria.hallTypes.join(', ')}`}
            </p>
          </div>
          <button type="button" onClick={onChange} className="btn-primary shrink-0 px-4 py-2.5 text-sm">
            <ChevronLeft className="h-4 w-4" />
            החלף
          </button>
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

function ResultCard({ screening, showMovie }: { screening: Screening; showMovie: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const movie = getMovie(screening.movieId);
  const cinema = getCinema(screening.cinemaId);
  const chain = chainOf(screening.cinemaId) ? getChain(chainOf(screening.cinemaId)!) : undefined;
  const city = getCityOf(screening.cinemaId);
  const fillRatio = screening.totalSeats > 0 ? screening.availableSeats / screening.totalSeats : 0;
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
          {chain && (
            <span
              className={`mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chain.color}`}
            >
              {chain.shortName}
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoTile icon={<Layers className="h-4 w-4" />} label="סוג אולם" value={screening.hallType} />
            <InfoTile icon={<Volume2 className="h-4 w-4" />} label="שפת סאונד" value={screening.audioLang} />
            <InfoTile icon={<Subtitles className="h-4 w-4" />} label="כתוביות" value={screening.subtitleLang} />
            <InfoTile icon={<Layers className="h-4 w-4" />} label="שורות" value={`${screening.totalRows} שורות`} />
          </div>

          {/* Seat availability */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-gray-300">
                <Armchair className="h-4 w-4" />
                מושבים פנויים
              </span>
              <span className="font-bold text-white">
                {screening.availableSeats} מתוך {screening.totalSeats}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={`h-full rounded-full transition-all duration-500 ${availColor}`}
                style={{ width: `${Math.max(fillRatio * 100, 2)}%` }}
              />
            </div>
          </div>

          {/* Action */}
          <a
            href={`https://cinema-finder.example/booking/${screening.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-4 w-full text-sm"
          >
            <ExternalLink className="h-4 w-4" />
            לבחירת מושבים באתר הקולנוע
          </a>
        </div>
      )}
    </div>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-500">
        {icon}
        {label}
      </div>
      <p className="font-bold text-gray-100">{value}</p>
    </div>
  );
}

function filterScreenings(criteria: SearchCriteria, preferences: Preferences): Screening[] {
  const minMin = criteria.minTime ? timeToMinutes(criteria.minTime) : 0;
  const maxMin = criteria.maxTime ? timeToMinutes(criteria.maxTime) : 24 * 60;

  return ALL_SCREENINGS.filter((s) => {
    // Movie filter
    if (criteria.mode === 'movie' && criteria.movieId && s.movieId !== criteria.movieId) return false;
    // Date filter
    if (criteria.date && s.date !== criteria.date) return false;
    // Time filter
    const sm = timeToMinutes(s.time);
    if (criteria.minTime && sm < minMin) return false;
    if (criteria.maxTime && sm > maxMin) return false;
    // Hall filter
    if (criteria.hallTypes.length > 0 && !criteria.hallTypes.includes(s.hallType)) return false;
    // Preferences: chains
    if (preferences.selectedChains.length > 0) {
      const c = chainOf(s.cinemaId);
      if (!c || !preferences.selectedChains.includes(c)) return false;
    }
    // Preferences: cities (only in regions mode)
    if (preferences.locationMode === 'regions' && preferences.selectedCities.length > 0) {
      const city = getCityOf(s.cinemaId);
      if (!preferences.selectedCities.includes(city)) return false;
    }
    return true;
  });
}
