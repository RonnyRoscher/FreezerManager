export type LabelSize = { widthMm: number; heightMm: number };

export const DEFAULT_LABEL_SIZE: LabelSize = { widthMm: 62, heightMm: 29 };

const KEY = 'fm.labelSize';

const isPositive = (n: unknown): n is number => typeof n === 'number' && n > 0;

export function loadLabelSize(): LabelSize {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (isPositive(parsed?.widthMm) && isPositive(parsed?.heightMm)) {
      return { widthMm: parsed.widthMm, heightMm: parsed.heightMm };
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_LABEL_SIZE;
}

export function saveLabelSize(size: LabelSize): void {
  localStorage.setItem(KEY, JSON.stringify(size));
}

export function pageCss(size: LabelSize): string {
  return `@page { size: ${size.widthMm}mm ${size.heightMm}mm; margin: 0 }`;
}
