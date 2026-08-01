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
