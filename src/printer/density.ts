export const DEFAULT_DENSITY = 4;

const KEY = 'fm.printDensity';

export function loadDensity(): number {
  const value = Number.parseInt(localStorage.getItem(KEY) ?? '', 10);
  if (Number.isNaN(value)) return DEFAULT_DENSITY;
  return Math.min(9, Math.max(1, value));
}

export function saveDensity(density: number): void {
  localStorage.setItem(KEY, String(density));
}
