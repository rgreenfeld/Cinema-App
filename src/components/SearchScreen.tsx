
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Settings2, Search, Clock, Calendar, Film, Clapperboard, Check, Loader2 } from 'lucide-react';
import { HALL_TYPES, getUpcomingDates, formatDateLabel, ALL_DATES_VALUE, ALL_DAY_VALUE } from '@/constants';
import type { Preferences, SearchCriteria } from '@/types';
import { titlesToMovies, type Movie, type Cinema, type Screening } from '@/data';
import { buildIntervals, timeToMinutes, nowIsraelMinutes } from '@/timeUtils';
import { fetchMoviesByBranchesAndDate, todayInIsrael } from '@/lib/supabase';
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

export function SearchScreen({ preferences, criteria, onChange, onBack, onSearch, movies: propMovies, cinemas: propCinemas, screenings: propScreenings, submitMovies, submitMoviesLoading, submitMoviesError }: Props) {
  const dates = useMemo(() => getUpcomingDates(7), []);
  const [hallOpen, setHallOpen] = useState(false);
  const [movieOpen, setMovieOpen] = useState(false);
  const [movieQuery, setMovieQuery] = useState('');

  // ── Dynamic movies from Supabase (location + date aware) ──────────────
  const [dynamicMovies, setDynamicMovies] = useState<Movie[]>([]);
  const [moviesLoading, setMoviesLoading] = useState(false);
  const [moviesError, setMoviesError] = useState(false);

  // Map the selected cities/regions back to full cinema branch names.
  const locationBranches = useMemo(
    () => getCinemaNamesForSelection(preferences.selectedCities, preferences.selectedRegions),
    [preferences.selectedCities, preferences.selectedRegions]
  );

  // Effective date for query/filtering. "All dates" and unset both mean
  // upcoming (today+), so both resolve to null here.
  const effectiveDate = criteria.date && criteria.date !== ALL_DATES_VALUE ? criteria.date : null;
  const screeningSource = propScreenings ?? [];

  const kidsMovieIds = useMemo(
    () => new Set(
      screeningSource
        .filter((screening) => screening.isDubbed && screening.audioLang === 'עברית')
        .map((screening) => screening.movieId)
    ),
    [screeningSource]
  );

  useEffect(() => {
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

    // No date selected yet -> fetch upcoming titles (today and forward).
    fetchMoviesByBranchesAndDate(locationBranches, effectiveDate ?? undefined)
      .then((titles) => {
        if (cancelled) return;
        setDynamicMovies(titlesToMovies(titles));
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
  }, [locationBranches, effectiveDate]);

  // Build movie options directly from the same screenings context used by
  // time-based browsing, so the dropdown cannot miss titles that are visible
  // in "by hours" mode.
  const moviesFromScreenings = useMemo(() => {
    if (!propMovies || !propCinemas || screeningSource.length === 0) return [];

    const today = todayInIsrael();

    const cinemaById = new Map(propCinemas.map((c) => [c.id, c]));
    const movieById = new Map(propMovies.map((m) => [m.id, m]));
    const out = new Map<string, Movie>();

    for (const s of screeningSource) {
      if (effectiveDate) {
        if (s.date !== effectiveDate) continue;
        if (s.date === today && timeToMinutes(s.time) < nowIsraelMinutes()) continue;
      } else if (s.date < today) {
        // No selected date -> only upcoming (today and forward).
        continue;
      }

      const cinema = cinemaById.get(s.cinemaId);
      if (!cinema) continue;

      if (preferences.selectedChains.length > 0 && !preferences.selectedChains.includes(cinema.chain)) {
        continue;
      }

      if (
        preferences.locationMode === 'regions' &&
        preferences.selectedBranches.length > 0 &&
        !preferences.selectedBranches.includes(cinema.name)
      ) {
        continue;
      }

      const movie = movieById.get(s.movieId);
      if (movie) out.set(movie.id, movie);
    }

    return Array.from(out.values()).sort((a, b) => a.title.localeCompare(b.title, 'he'));
  }, [effectiveDate, propMovies, propCinemas, screeningSource, preferences.selectedChains, preferences.locationMode, preferences.selectedBranches]);

  // Before a movie is selected, prefer date/location-aware options so the
  // dropdown is useful. Once selected, keep the broad source stable: changing
  // the date or returning from results must not replace the movie catalogue
  // with only the titles screening on that date.
  const movies =
    (criteria.movieId
      ? submitMovies && submitMovies.length > 0
        ? submitMovies
        : propMovies
      : dynamicMovies.length > 0
        ? dynamicMovies
        : moviesFromScreenings.length > 0
          ? moviesFromScreenings
          : submitMovies && submitMovies.length > 0
            ? submitMovies
            : propMovies) ?? [];

  const visibleMovies = criteria.kidsOnly
    ? movies.filter((movie) => kidsMovieIds.has(movie.id))
    : movies;

  const matchingMovies = useMemo(() => {
    const query = movieQuery.trim().toLocaleLowerCase('he');
    if (!query) return visibleMovies;
    return visibleMovies.filter((movie) => movie.title.toLocaleLowerCase('he').includes(query));
  }, [visibleMovies, movieQuery]);

  // For each currently available movie option, compute only the dates that
  // have screenings under the active location/chain preferences.
  const availableDatesByMovieId = useMemo(() => {
    if (!propMovies || !propCinemas || screeningSource.length === 0 || movies.length === 0) {
      return new Map<string, string[]>();
    }

    const today = todayInIsrael();
    const cinemaById = new Map(propCinemas.map((c) => [c.id, c]));
    const movieById = new Map(propMovies.map((m) => [m.id, m]));

    const movieTitlesByOptionId = new Map<string, Set<string>>();
    for (const m of movies) {
      const titles = new Set<string>();
      titles.add(m.title);
      const canonical = movieById.get(m.id);
      if (canonical?.title) titles.add(canonical.title);
      movieTitlesByOptionId.set(m.id, titles);
    }

    const out = new Map<string, Set<string>>();

    for (const s of screeningSource) {
      if (s.date < today) continue;
      if (s.date === today && timeToMinutes(s.time) < nowIsraelMinutes()) continue;
      if (criteria.kidsOnly && !(s.isDubbed && s.audioLang === 'עברית')) continue;

      const cinema = cinemaById.get(s.cinemaId);
      if (!cinema) continue;

      if (preferences.selectedChains.length > 0 && !preferences.selectedChains.includes(cinema.chain)) {
        continue;
      }

      if (
        preferences.locationMode === 'regions' &&
        preferences.selectedBranches.length > 0 &&
        !preferences.selectedBranches.includes(cinema.name)
      ) {
        continue;
      }

      const canonicalMovieTitle = movieById.get(s.movieId)?.title;

      for (const [optionId, titles] of movieTitlesByOptionId) {
        if (s.movieId !== optionId && (!canonicalMovieTitle || !titles.has(canonicalMovieTitle))) {
          continue;
        }

        const set = out.get(optionId) ?? new Set<string>();
        set.add(s.date);
        out.set(optionId, set);
      }
    }

    const sorted = new Map<string, string[]>();
    for (const [movieId, set] of out) {
      sorted.set(movieId, Array.from(set).sort((a, b) => a.localeCompare(b)));
    }

    return sorted;
  }, [movies, propMovies, propCinemas, screeningSource, preferences.selectedChains, preferences.locationMode, preferences.selectedBranches, criteria.kidsOnly]);

  const movieDateOptions = useMemo(() => {
    if (criteria.mode !== 'movie') return dates;
    if (!criteria.movieId) return dates;
    const filtered = availableDatesByMovieId.get(criteria.movieId) ?? [];
    return filtered.length > 0 ? filtered : dates;
  }, [criteria.mode, criteria.movieId, availableDatesByMovieId, dates]);

  // If the currently selected movie is no longer in the available list,
  // clear the stale selection so the dropdown stays consistent.
  useEffect(() => {
    if (!criteria.movieId) return;
    if (moviesLoading) return;
    if (movies.length > 0 && !movies.some((m) => m.id === criteria.movieId)) {
      onChange({ ...criteria, movieId: null });
    }
  }, [movies, moviesLoading, criteria.movieId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedMovie = criteria.movieId ? (movies ? movies.find(m => m.id === criteria.movieId) : undefined) : undefined;

  // When the selected date is today, the minimum start time cannot be earlier
  // than the current local hour (in Israel). Otherwise the standard 10:00 floor
  // applies. The floor is rounded UP to the next half-hour boundary.
  const minTimeFloor = useMemo(() => {
    if (criteria.date && criteria.date === todayInIsrael()) {
      const now = nowIsraelMinutes();
      return Math.min(Math.max(Math.ceil(now / 30) * 30, EARLIEST_MIN), LATEST_MIN);
    }
    return EARLIEST_MIN;
  }, [criteria.date]);

  const minTimes = useMemo(() => buildIntervals(minTimeFloor, LATEST_MIN), [minTimeFloor]);

  // Show a full-screen loading spinner during the submit fetch (preferences →
  // search transition), after all hooks have been called consistently.
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

  const setMode = (mode: 'movie' | 'time') => {
    onChange({
      mode,
      movieId: null,
      kidsOnly: false,
      date: null,
      minTime: null,
      hallTypes: [...HALL_TYPES],
      allDay: false,
    });
    setHallOpen(false);
    setMovieOpen(false);
    setMovieQuery('');
  };

  const setMovie = (movieId: string) => {
    // Keep date only if it exists for the new movie; otherwise reset date/time.
    const nextMovieDates = availableDatesByMovieId.get(movieId) ?? [];
    const keepCurrentDate = Boolean(criteria.date && nextMovieDates.includes(criteria.date));

    onChange({
      ...criteria,
      movieId,
      date: keepCurrentDate ? criteria.date : null,
      minTime: null,
      hallTypes: [...HALL_TYPES],
      allDay: false,
    });
    setHallOpen(false);
    setMovieOpen(false);
    setMovieQuery('');
  };

  const setDate = (date: string) => {
    onChange({ ...criteria, date, minTime: null, allDay: false });
  };

  const setMinTime = (value: string) => {
    if (value === ALL_DAY_VALUE) {
      onChange({ ...criteria, allDay: true, minTime: null });
      return;
    }
    onChange({ ...criteria, allDay: false, minTime: value || null });
  };

  const toggleHall = (h: string) => {
    const has = criteria.hallTypes.includes(h);
    onChange({
      ...criteria,
      hallTypes: has ? criteria.hallTypes.filter((x) => x !== h) : [...criteria.hallTypes, h],
    });
  };

  const timeSelectsDisabled = !criteria.date;

  const canSearch =
    criteria.mode === 'movie'
      ? Boolean(criteria.movieId && criteria.date && (criteria.allDay || criteria.minTime))
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
            <h1 className="text-lg font-black leading-tight text-white">CineMaster</h1>
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
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 transition-colors hover:border-white/15">
              <input
                type="checkbox"
                className="sr-only"
                checked={criteria.kidsOnly}
                onChange={(event) => onChange({ ...criteria, kidsOnly: event.target.checked, movieId: null })}
              />
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                  criteria.kidsOnly ? 'border-rose-500 bg-rose-500' : 'border-gray-500'
                }`}
              >
                {criteria.kidsOnly && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
              </span>
              <span className="font-medium text-gray-100">הצג רק סרטי ילדים מדובבים</span>
            </label>
            <label className="field-label mt-5">בחירת סרט</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMovieOpen((open) => !open)}
                disabled={moviesLoading}
                className="select-base flex items-center justify-between gap-3"
              >
                <span className={selectedMovie ? 'truncate text-gray-100' : 'text-gray-500'}>
                  {moviesLoading ? 'טוען סרטים...' : selectedMovie?.title ?? 'בחר סרט...'}
                </span>
                {moviesLoading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-rose-400" /> : <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${movieOpen ? 'rotate-180' : ''}`} />}
              </button>
              {movieOpen && !moviesLoading && (
                <div className="expand-enter absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-white/[0.1] bg-[#12121a] shadow-xl shadow-black/40">
                  <div className="border-b border-white/[0.06] p-2">
                    <input
                      autoFocus
                      value={movieQuery}
                      onChange={(event) => setMovieQuery(event.target.value)}
                      placeholder="חיפוש סרט..."
                      className="select-base py-2.5"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto p-2">
                    {matchingMovies.length > 0 ? matchingMovies.map((movie) => (
                      <button
                        type="button"
                        key={movie.id}
                        onClick={() => setMovie(movie.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-right transition-colors ${criteria.movieId === movie.id ? 'bg-rose-500/15 text-rose-100' : 'text-gray-300 hover:bg-white/[0.06]'}`}
                      >
                        <span className="truncate font-medium">{movie.title}</span>
                        <span className="shrink-0 text-xs text-gray-500">{movie.genre}</span>
                      </button>
                    )) : (
                      <p className="px-3 py-4 text-center text-sm text-gray-500">לא נמצאו סרטים תואמים</p>
                    )}
                  </div>
                </div>
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
                {selectedMovie.poster && (
                  <img
                    src={selectedMovie.poster}
                    alt={selectedMovie.title}
                    className="h-16 w-12 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate font-bold text-white">{selectedMovie.title}</p>
                  {(selectedMovie.durationMin != null || selectedMovie.rating != null) && (
                    <p className="text-xs text-gray-400">
                      {selectedMovie.durationMin != null && `${selectedMovie.durationMin} דקות`}
                      {selectedMovie.durationMin != null && selectedMovie.rating != null && ' · '}
                      {selectedMovie.rating != null && `⭐ ${selectedMovie.rating}`}
                    </p>
                  )}
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
                className="select-base appearance-none pl-10"
              >
                <option value="">בחר יום...</option>
                <option value={ALL_DATES_VALUE}>כל הימים</option>
                {movieDateOptions.map((d) => (
                  <option key={d} value={d}>
                    {formatDateLabel(d)}
                  </option>
                ))}
              </select>
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            </div>
          </div>

          {/* Start time */}
          <div>
            <label className="field-label">הקרנות החל מ-</label>
            <div className="relative">
              <select
                value={criteria.allDay ? ALL_DAY_VALUE : criteria.minTime ?? ''}
                onChange={(e) => setMinTime(e.target.value)}
                disabled={timeSelectsDisabled}
                className="select-base appearance-none pl-10"
              >
                <option value="">בחר שעה...</option>
                <option value={ALL_DAY_VALUE}>כל היום</option>
                {minTimes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            </div>
          </div>

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

          <div>
            <label className="field-label">הקרנות החל מ-</label>
            <div className="relative">
              <select
                value={criteria.allDay ? ALL_DAY_VALUE : criteria.minTime ?? ''}
                onChange={(e) => setMinTime(e.target.value)}
                disabled={timeSelectsDisabled}
                className="select-base appearance-none pl-10"
              >
                <option value="">בחר שעה...</option>
                <option value={ALL_DAY_VALUE}>כל היום</option>
                {minTimes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            </div>
          </div>

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

