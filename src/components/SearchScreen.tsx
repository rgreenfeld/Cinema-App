
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Settings2, Search, Clock, Calendar, Film, Clapperboard, Check, Loader2 } from 'lucide-react';
import { HALL_TYPES, getUpcomingDates, formatDateLabel } from '@/constants';
import type { Preferences, SearchCriteria } from '@/types';
import type { Movie, Cinema, Screening } from '@/data';
import { buildIntervals, timeToMinutes, minutesToTime } from '@/timeUtils';
import { fetchMoviesByBranchesAndDate } from '@/lib/supabase';
import { getCinemaNamesForSelection } from '@/utils/cinemaMapping';

interface Props {
  preferences: Preferences;
  criteria: SearchCriteria;
  onChange: (c: SearchCriteria) => void;
  onBack: () => void;
  onSearch: () => void;
  movies?: Movie[];
  cinemas?: Cinema[];
  screenings?: Screening[];
  dataLoading?: boolean;
  /** Movies fetched when the user submitted the preferences screen. */
  submitMovies?: Movie[];
  /** True while the preferences → search submit fetch is in flight. */
  submitMoviesLoading?: boolean;
  submitMoviesError?: boolean;
}

const EARLIEST_MIN = 10 * 60; // 10:00
const LATEST_MIN = 23 * 60; // 23:00
const MAX_SAFE_MIN = 23 * 60 + 59; // 23:59 fallback

export function SearchScreen({ preferences, criteria, onChange, onBack, onSearch, movies: propMovies, cinemas: propCinemas, screenings: propScreenings, dataLoading, submitMovies, submitMoviesLoading, submitMoviesError }: Props) {
  const dates = useMemo(() => getUpcomingDates(7), []);
  const [hallOpen, setHallOpen] = useState(false);

  // ── Dynamic movies from Supabase (location + date aware) ──────────────
  const [dynamicMovies, setDynamicMovies] = useState<Movie[]>([]);
  const [moviesLoading, setMoviesLoading] = useState(false);
  const [moviesError, setMoviesError] = useState(false);

  // Map the selected cities/regions back to full cinema branch names.
  const locationBranches = useMemo(
    () => getCinemaNamesForSelection(preferences.selectedCities, preferences.selectedRegions),
    [preferences.selectedCities, preferences.selectedRegions]
  );

  // Effective date: the chosen date, or today if none is selected yet.
  const effectiveDate = criteria.date ?? dates[0] ?? null;

  // Only run the dynamic in-screen fetch when we don't already have movies
  // from the preferences → search submit fetch. This avoids a redundant
  // duplicate query right after the transition.
  const alreadyHaveMovies = (submitMovies && submitMovies.length > 0) || submitMoviesLoading;

  useEffect(() => {
    if (alreadyHaveMovies) return; // Movies already fetched on submit.
    let cancelled = false;

    // No date → nothing to fetch.
    if (!effectiveDate) {
      setDynamicMovies([]);
      setMoviesLoading(false);
      setMoviesError(false);
      return;
    }

    setMoviesLoading(true);
    setMoviesError(false);

    fetchMoviesByBranchesAndDate(locationBranches, effectiveDate)
      .then((titles) => {
        if (cancelled) return;
        // Convert fetched titles into the app's Movie[] shape (defaults
        // matching transformSupabaseRows).
        const movies: Movie[] = titles.map((title) => ({
          id: `supa-m-${title.replace(/\s+/g, '-').replace(/[^א-ת\w-]/g, '')}`,
          title,
          poster: 'https://images.pexels.com/photos/3130827/pexels-photo-3130827.jpeg?auto=compress&cs=tinysrgb&w=400',
          durationMin: 120,
          rating: 7.5,
          genre: 'סרט',
        }));
        setDynamicMovies(movies);
      })
      .catch(() => {
        if (!cancelled) setMoviesError(true);
      })
      .finally(() => {
        if (!cancelled) setMoviesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [locationBranches, effectiveDate, alreadyHaveMovies]);

  // If the currently selected movie is no longer in the fetched list,
  // clear the stale selection so the dropdown stays consistent.
  useEffect(() => {
    if (!criteria.movieId) return;
    if (moviesLoading) return;
    if (dynamicMovies.length > 0 && !dynamicMovies.some((m) => m.id === criteria.movieId)) {
      onChange({ ...criteria, movieId: null });
    }
  }, [dynamicMovies, moviesLoading, criteria.movieId]); // eslint-disable-line react-hooks/exhaustive-deps

// Use real data if available. The movies fetched on the preferences → search
// submit take priority; fall back to the pre-fetched prop list.
const movies = (submitMovies && submitMovies.length > 0 ? submitMovies : propMovies) ?? [];
const screeningSource = propScreenings ?? [];

// Show a full-screen loading spinner during the submit fetch (preferences →
// search transition), so the user knows data is being retrieved.
if (submitMoviesLoading) {
  return (
    <div className="screen-enter flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-600/20 to-rose-500/5 ring-1 ring-rose-500/20">
        <Loader2 className="h-8 w-8 animate-spin text-rose-400" />
      </div>
      <div>
        <p className="text-lg font-bold text-white">טוען סרטים מהשרת...</p>
        <p className="mt-1 text-sm text-gray-400">מחפש הקרנות בבתי הקולנוע שנבחרו</p>
      </div>
    </div>
  );
}

  const selectedMovie = criteria.movieId ? (movies ? movies.find(m => m.id === criteria.movieId) : undefined) : undefined;

  const getChain = (cinemaId: string) => {
    if (propCinemas) {
      const c = propCinemas.find(c => c.id === cinemaId);
      return c?.chain;
    }
    return undefined;
  };

  const getCity = (cinemaId: string) => {
    if (propCinemas) {
      const c = propCinemas.find(c => c.id === cinemaId);
      return c?.city ?? '';
    }
    return '';
  };

  const getBranchName = (cinemaId: string) => {
    if (propCinemas) {
      const c = propCinemas.find(c => c.id === cinemaId);
      return c?.name ?? '';
    }
    return '';
  };

  // Dynamically compute the latest screening minute for the selected date,
  // considering selected movie (in movie mode) and user preferences (chains/cities).
  const latestScreeningMin = useMemo(() => {
    if (!criteria.date) return MAX_SAFE_MIN;

    const screeningsForDate = screeningSource.filter((s) => {
      // Date filter
      if (s.date !== criteria.date) return false;
      // Movie filter (only in movie mode)
      if (criteria.mode === 'movie' && criteria.movieId && s.movieId !== criteria.movieId) return false;
      // Chain preference
      if (preferences.selectedChains.length > 0) {
        const c = getChain(s.cinemaId);
        if (!c || !preferences.selectedChains.includes(c)) return false;
      }
      // City/region/branch preference (only in regions mode)
      if (preferences.locationMode === 'regions') {
        const branchName = getBranchName(s.cinemaId);
        if (
          preferences.selectedBranches.length > 0 &&
          (!branchName || !preferences.selectedBranches.includes(branchName))
        ) {
          return false;
        }
      }
      return true;
    });

    if (screeningsForDate.length === 0) return MAX_SAFE_MIN;

    const maxMin = Math.max(...screeningsForDate.map((s) => timeToMinutes(s.time)));
    // Add a buffer of 30 minutes so the max time includes the latest screening
    return Math.min(maxMin + 30, MAX_SAFE_MIN);
  }, [criteria.date, criteria.mode, criteria.movieId, preferences.selectedChains, preferences.locationMode, preferences.selectedCities, screeningSource, propCinemas]);

  const minTimes = useMemo(() => buildIntervals(EARLIEST_MIN, LATEST_MIN), []);

  // Max time options: from minTime+30 up to the dynamically computed latest time
  const maxTimes = useMemo(() => {
    if (!criteria.minTime) return [];
    const startMin = timeToMinutes(criteria.minTime) + 30;
    return buildIntervals(startMin, latestScreeningMin);
  }, [criteria.minTime, latestScreeningMin]);

  const setMode = (mode: 'movie' | 'time') => {
    onChange({
      mode,
      movieId: null,
      date: null,
      minTime: null,
      maxTime: null,
      hallTypes: [],
      allDay: false,
    });
    setHallOpen(false);
  };

  const setMovie = (movieId: string) => {
    // Default the date to today when a movie is selected
    const today = dates[0] ?? null;
    onChange({ ...criteria, movieId, date: today, minTime: null, maxTime: null, hallTypes: [], allDay: false });
    setHallOpen(false);
  };

  const setDate = (date: string) => {
    onChange({ ...criteria, date, minTime: null, maxTime: null, allDay: false });
  };

  const setMinTime = (minTime: string) => {
    if (criteria.mode === 'time') {
      // Dynamically compute max as the latest screening time for the selected data/preferences
      const max = minutesToTime(Math.min(timeToMinutes(minTime) + 3 * 60, latestScreeningMin));
      onChange({ ...criteria, minTime, maxTime: max });
    } else {
      onChange({ ...criteria, minTime, maxTime: null });
    }
  };

  const setMaxTime = (maxTime: string) => {
    onChange({ ...criteria, maxTime });
  };

  const setAllDay = (checked: boolean) => {
    if (checked) {
      onChange({ ...criteria, allDay: true, minTime: null, maxTime: null });
    } else {
      onChange({ ...criteria, allDay: false });
    }
  };

  const toggleHall = (h: string) => {
    const has = criteria.hallTypes.includes(h);
    onChange({
      ...criteria,
      hallTypes: has ? criteria.hallTypes.filter((x) => x !== h) : [...criteria.hallTypes, h],
    });
  };

  const timeSelectsDisabled = !criteria.date || criteria.allDay;

  const canSearch =
    criteria.mode === 'movie'
      ? Boolean(criteria.movieId && criteria.date && (criteria.allDay || (criteria.minTime && criteria.maxTime)))
      : Boolean(criteria.date && (criteria.allDay || criteria.minTime));

  const locationLabel =
    preferences.locationMode === 'current'
      ? 'מיקום נוכחי (15 ק"מ)'
      : `${preferences.selectedCities.length} ערים נבחרו`;

  return (
    <div className="screen-enter mx-auto max-w-3xl px-4 pb-32 pt-6">
      {/* Top bar */}
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-600/20 to-rose-500/5 ring-1 ring-rose-500/20">
            <Clapperboard className="h-5 w-5 text-rose-400" />
          </div>
          <div>
            <h1 className="text-lg font-black leading-tight text-white">קולנוע פיינדר</h1>
            <p className="text-xs text-gray-500">{locationLabel}</p>
          </div>
        </div>
        <button type="button" onClick={onBack} className="btn-ghost text-sm">
          <Settings2 className="h-4 w-4" />
          הגדרות ומיקום
        </button>
      </header>

      {/* Mode tabs */}
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5">
        <button
          type="button"
          onClick={() => setMode('movie')}
          className={`flex items-center justify-center gap-2 rounded-xl py-3 font-bold transition-all ${
            criteria.mode === 'movie'
              ? 'bg-gradient-to-l from-rose-600 to-rose-500 text-white shadow-lg shadow-rose-900/30'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Film className="h-4 w-4" />
          לפי סרט
        </button>
        <button
          type="button"
          onClick={() => setMode('time')}
          className={`flex items-center justify-center gap-2 rounded-xl py-3 font-bold transition-all ${
            criteria.mode === 'time'
              ? 'bg-gradient-to-l from-rose-600 to-rose-500 text-white shadow-lg shadow-rose-900/30'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Clock className="h-4 w-4" />
          לפי שעות
        </button>
      </div>

      {/* Movie mode */}
      {criteria.mode === 'movie' && (
        <section className="space-y-5">
          {/* Movie */}
          <div>
            <label className="field-label">בחירת סרט</label>
            <div className="relative">
              <select
                value={criteria.movieId ?? ''}
                onChange={(e) => setMovie(e.target.value)}
                disabled={moviesLoading}
                className="select-base appearance-none pl-10"
              >
                <option value="">{moviesLoading ? 'טוען סרטים...' : 'בחר סרט...'}</option>
                {!moviesLoading && movies.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} · {m.genre} · ⭐ {m.rating}
                  </option>
                ))}
              </select>
              {moviesLoading ? (
                <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-rose-400" />
              ) : (
                <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              )}
            </div>

            {/* Loading hint */}
            {moviesLoading && (
              <div className="expand-enter mt-3 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin text-rose-400" />
                טוען סרטים למיקום ולתאריך שנבחרו...
              </div>
            )}

            {/* Empty state */}
            {!moviesLoading && !moviesError && !submitMoviesError && movies.length === 0 && (
              <div className="expand-enter mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-gray-400">
                לא נמצאו סרטים למיקום ולתאריך שנבחרו. נסה אזור או תאריך אחר.
              </div>
            )}

            {/* Error state (submit fetch or in-screen fetch) */}
            {!moviesLoading && (moviesError || submitMoviesError) && (
              <div className="expand-enter mt-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-3 text-sm text-rose-300">
                לא הצלחנו לטעון את רשימת הסרטים. בדוק את החיבור ונסה שוב.
              </div>
            )}

            {selectedMovie && (
              <div className="expand-enter mt-3 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <img
                  src={selectedMovie.poster}
                  alt={selectedMovie.title}
                  className="h-16 w-12 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate font-bold text-white">{selectedMovie.title}</p>
                  <p className="text-xs text-gray-400">
                    {selectedMovie.genre} · {selectedMovie.durationMin} דקות · ⭐ {selectedMovie.rating}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="field-label">תאריך</label>
            <div className="relative">
              <select
                value={criteria.date ?? ''}
                onChange={(e) => setDate(e.target.value)}
                disabled={!criteria.movieId}
                className="select-base appearance-none pl-10"
              >
                <option value="">בחר יום...</option>
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {formatDateLabel(d)}
                  </option>
                ))}
              </select>
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            </div>
          </div>

          {/* Min / Max time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">שעת התחלה מינימלית</label>
              <div className="relative">
                <select
                  value={criteria.minTime ?? ''}
                  onChange={(e) => setMinTime(e.target.value)}
                  disabled={timeSelectsDisabled}
                  className="select-base appearance-none pl-10"
                >
                  <option value="">בחר שעה...</option>
                  {minTimes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              </div>
            </div>
            <div>
              <label className="field-label">שעת סיום מקסימלית</label>
              <div className="relative">
                <select
                  value={criteria.maxTime ?? ''}
                  onChange={(e) => setMaxTime(e.target.value)}
                  disabled={timeSelectsDisabled || !criteria.minTime}
                  className="select-base appearance-none pl-10"
                >
                  <option value="">בחר שעה...</option>
                  {maxTimes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              </div>
            </div>
          </div>

          {/* All Day Checkbox */}
          {criteria.date && (
            <div className="expand-enter">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-colors hover:border-white/15">
                <input
                  type="checkbox"
                  checked={criteria.allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  className="h-5 w-5 shrink-0 appearance-none rounded border-2 border-white/20 bg-transparent checked:border-rose-500 checked:bg-rose-500 transition-colors"
                  style={{
                    background: criteria.allDay ? '#f43f5e' : 'transparent',
                    borderColor: criteria.allDay ? '#f43f5e' : 'rgba(255,255,255,0.2)',
                  }}
                />
                <span className="text-sm font-medium text-gray-300">
                  בחר אפשרות זו להצגת כל ההקרנות של אותו יום
                </span>
              </label>
            </div>
          )}

          {/* Hall type */}
          <HallTypePicker
            selected={criteria.hallTypes}
            onToggle={toggleHall}
            disabled={!criteria.movieId}
            open={hallOpen}
            setOpen={setHallOpen}
          />
        </section>
      )}

      {/* Time mode */}
      {criteria.mode === 'time' && (
        <section className="space-y-5">
          <div>
            <label className="field-label">תאריך</label>
            <div className="relative">
              <select
                value={criteria.date ?? ''}
                onChange={(e) => setDate(e.target.value)}
                className="select-base appearance-none pl-10"
              >
                <option value="">בחר יום...</option>
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {formatDateLabel(d)}
                  </option>
                ))}
              </select>
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">שעת התחלה מינימלית</label>
              <div className="relative">
                <select
                  value={criteria.minTime ?? ''}
                  onChange={(e) => setMinTime(e.target.value)}
                  disabled={timeSelectsDisabled}
                  className="select-base appearance-none pl-10"
                >
                  <option value="">בחר שעה...</option>
                  {minTimes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              </div>
            </div>
            <div>
              <label className="field-label">שעת סיום (אוטומטי)</label>
              <div className="flex h-[50px] items-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-gray-400">
                {criteria.maxTime ?? '—'}
                <span className="mr-auto text-xs text-gray-600">עד ההקרנה האחרונה</span>
              </div>
            </div>
          </div>

          {/* All Day Checkbox */}
          {criteria.date && (
            <div className="expand-enter">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-colors hover:border-white/15">
                <input
                  type="checkbox"
                  checked={criteria.allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  className="h-5 w-5 shrink-0 appearance-none rounded border-2 border-white/20 bg-transparent checked:border-rose-500 checked:bg-rose-500 transition-colors"
                  style={{
                    background: criteria.allDay ? '#f43f5e' : 'transparent',
                    borderColor: criteria.allDay ? '#f43f5e' : 'rgba(255,255,255,0.2)',
                  }}
                />
                <span className="text-sm font-medium text-gray-300">
                  בחר אפשרות זו להצגת כל ההקרנות של אותו יום
                </span>
              </label>
            </div>
          )}

          <HallTypePicker
            selected={criteria.hallTypes}
            onToggle={toggleHall}
            disabled={false}
            open={hallOpen}
            setOpen={setHallOpen}
          />
        </section>
      )}

      {/* Search button */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/[0.06] bg-[#0a0a0f]/85 px-4 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="text-sm text-gray-400">
            {canSearch ? (
              <span className="text-rose-300">מוכן לחיפוש</span>
            ) : criteria.mode === 'movie' ? (
              <span>בחר סרט, תאריך וטווח שעות</span>
            ) : (
              <span>בחר תאריך ושעת התחלה</span>
            )}
          </div>
          <button type="button" onClick={onSearch} disabled={!canSearch} className="btn-primary">
            <Search className="h-5 w-5" />
            הצג תוצאות
          </button>
        </div>
      </div>
    </div>
  );
}

function HallTypePicker({
  selected,
  onToggle,
  disabled,
  open,
  setOpen,
}: {
  selected: string[];
  onToggle: (h: string) => void;
  disabled: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  return (
    <div>
      <label className="field-label">סוג אולם (לא חובה)</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="select-base flex items-center justify-between"
      >
        <span className={selected.length > 0 ? 'text-gray-100' : 'text-gray-500'}>
          {selected.length > 0 ? `${selected.length} נבחרו: ${selected.join(', ')}` : 'בחר סוגי אולם...'}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && !disabled && (
        <div className="expand-enter mt-2 grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-[#12121a] p-3 sm:grid-cols-3">
          {HALL_TYPES.map((h) => {
            const checked = selected.includes(h);
            return (
              <button
                type="button"
                key={h}
                onClick={() => onToggle(h)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                  checked
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                    : 'border-white/[0.06] bg-white/[0.02] text-gray-400 hover:border-white/15'
                }`}
              >
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors"
                  style={{
                    borderColor: checked ? '#f43f5e' : 'rgba(255,255,255,0.2)',
                    background: checked ? '#f43f5e' : 'transparent',
                  }}
                >
                  {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </span>
                {h}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

