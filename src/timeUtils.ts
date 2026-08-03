export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Virtual minutes for late-night sorting.
 * Screenings between 00:00–03:59 get a +24h offset so they appear at the
 * END of that day's list (after 23:59) while still displaying their actual
 * clock time (e.g. 00:15 → displays 00:15, sorts as 24:15).
 */
export function virtualMinutesOf(time: string): number {
  const mins = timeToMinutes(time);
  return mins < 4 * 60 ? mins + 24 * 60 : mins;
}

export function minutesToTime(min: number): string {
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
}

export function addMinutes(time: string, mins: number): string {
  return minutesToTime(timeToMinutes(time) + mins);
}

/**
 * Current time-of-day in Israel (Asia/Jerusalem) as minutes since midnight
 * (e.g. 14:30 → 870). Used to enforce "no past times for today" rules in
 * the search time selectors and results filtering.
 */
export function nowIsraelMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  // Normalize "24" → 0 (some engines return 24 for midnight with hour12:false).
  const hour = parseInt(map.hour, 10) % 24;
  const minute = parseInt(map.minute, 10) || 0;
  return hour * 60 + minute;
}

export function clampMaxTime(time: string): string {
  return timeToMinutes(time) > 23 * 60 + 59 ? '23:59' : time;
}

/** 30-min intervals from earliest (in minutes) up to maxMinute inclusive */
export function buildIntervals(startMinute: number, endMinute: number): string[] {
  const out: string[] = [];
  for (let m = startMinute; m <= endMinute; m += 30) {
    out.push(minutesToTime(m));
  }
  return out;
}
