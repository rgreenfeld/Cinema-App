export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
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
