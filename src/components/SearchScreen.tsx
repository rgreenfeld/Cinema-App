import { useMemo, useState } from 'react';
import { ChevronDown, Settings2, Search, Clock, Calendar, Film, Clapperboard, Check } from 'lucide-react';
import { MOVIES, HALL_TYPES, getUpcomingDates, formatDateLabel, getMovie } from '@/data';
import type { Preferences, SearchCriteria } from '@/types';
import { buildIntervals, timeToMinutes, minutesToTime, clampMaxTime } from '@/timeUtils';

interface Props {
  preferences: Preferences;
  criteria: SearchCriteria;
  onChange: (c: SearchCriteria) => void;
  onBack: () => void;
  onSearch: () => void;
}

const EARLIEST_MIN = 10 * 60; // 10:00
const LATEST_MIN = 23 * 60; // 23:00
const LATEST_END_MIN = 23 * 60 + 59; // 23:59

export function SearchScreen({ preferences, criteria, onChange, onBack, onSearch }: Props) {
  const dates = useMemo(() => getUpcomingDates(7), []);
  const [hallOpen, setHallOpen] = useState(false);

  const selectedMovie = criteria.movieId ? getMovie(criteria.movieId) : undefined;

  const minTimes = useMemo(() => buildIntervals(EARLIEST_MIN, LATEST_MIN), []);
  const maxTimes = useMemo(() => {
    if (!criteria.minTime) return [];
    const startMin = timeToMinutes(criteria.minTime) + 30;
    return buildIntervals(startMin, LATEST_END_MIN);
  }, [criteria.minTime]);

  const setMode = (mode: 'movie' | 'time') => {
    onChange({
      mode,
      movieId: null,
      date: null,
      minTime: null,
      maxTime: null,
      hallTypes: [],
    });
    setHallOpen(false);
  };

  const setMovie = (movieId: string) => {
    onChange({ ...criteria, movieId, date: null, minTime: null, maxTime: null, hallTypes: [] });
    setHallOpen(false);
  };

  const setDate = (date: string) => {
    onChange({ ...criteria, date, minTime: null, maxTime: null });
  };

  const setMinTime = (minTime: string) => {
    if (criteria.mode === 'time') {
      const max = clampMaxTime(minutesToTime(timeToMinutes(minTime) + 3 * 60));
      onChange({ ...criteria, minTime, maxTime: max });
    } else {
      onChange({ ...criteria, minTime, maxTime: null });
    }
  };

  const setMaxTime = (maxTime: string) => {
    onChange({ ...criteria, maxTime });
  };

  const toggleHall = (h: string) => {
    const has = criteria.hallTypes.includes(h);
    onChange({
      ...criteria,
      hallTypes: has ? criteria.hallTypes.filter((x) => x !== h) : [...criteria.hallTypes, h],
    });
  };

  const canSearch =
    criteria.mode === 'movie'
      ? Boolean(criteria.movieId && criteria.date && criteria.minTime && criteria.maxTime)
      : Boolean(criteria.date && criteria.minTime);

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
                className="select-base appearance-none pl-10"
              >
                <option value="">בחר סרט...</option>
                {MOVIES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} · {m.genre} · ⭐ {m.rating}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            </div>
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
                  disabled={!criteria.date}
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
                  disabled={!criteria.minTime}
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
                  disabled={!criteria.date}
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
                <span className="mr-auto text-xs text-gray-600">+3 שעות</span>
              </div>
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
