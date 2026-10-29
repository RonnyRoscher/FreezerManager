const pad = (n: number) => String(n).padStart(2, '0');

function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseIso(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

/** Today's date in local time as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Adds months, clamping the day to the last day of the target month. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = parseIso(iso);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const lastDay = new Date(year, month, 0).getDate();
  return toIso(year, month, Math.min(d, lastDay));
}

export function formatDate(iso: string): string {
  const [y, m, d] = parseIso(iso);
  return `${pad(d)}.${pad(m)}.${y}`;
}

/** Number of whole months between two dates (from <= to). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = parseIso(from);
  const [ty, tm, td] = parseIso(to);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd && addMonths(from, months) > to) months -= 1;
  return months;
}

export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = parseIso(from);
  const [ty, tm, td] = parseIso(to);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}
