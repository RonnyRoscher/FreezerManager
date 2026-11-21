import { formatDate } from '../domain/dates';
import type { ItemView } from '../domain/types';

/** Label size as the printer reports it: along the feed (length) and across the head (width). */
export type LabelSizeMm = { lengthMm: number; widthMm: number };

const DOTS_PER_MM = 8;
const ELLIPSIS = '…';

export function labelLines(item: ItemView) {
  return {
    name: item.name,
    quantity: item.quantity || null,
    details: item.details || null,
    date: formatDate(item.frozen_at),
    location: `${item.freezer.name} › ${item.compartment.name}`,
    code: item.short_code,
  };
}

/** Splits a word that is wider than the line into pieces that fit. */
function breakWord(word: string, maxWidth: number, measure: (s: string) => number): string[] {
  const pieces: string[] = [];
  let rest = word;
  while (measure(rest) > maxWidth) {
    let end = 1;
    while (end < rest.length && measure(rest.slice(0, end + 1)) <= maxWidth) end++;
    pieces.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  pieces.push(rest);
  return pieces;
}

/**
 * Greedy word wrap. Words wider than the line are broken; text beyond `maxLines` is cut off
 * and the last line ends with an ellipsis.
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    const pieces = breakWord(word, maxWidth, measure);
    lines.push(...pieces.slice(0, -1));
    current = pieces[pieces.length - 1];
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  let last = lines.slice(maxLines - 1).join(' ');
  while (last && measure(`${last.trimEnd()}${ELLIPSIS}`) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}${ELLIPSIS}`;
  return kept;
}

/** Positions on the label in printer dots (8 per mm). */
export function labelGeometry(size: LabelSizeMm) {
  const width = Math.round(size.lengthMm * DOTS_PER_MM);
  const height = Math.round(size.widthMm * DOTS_PER_MM);
  const margin = DOTS_PER_MM;
  const qrSize = Math.min(height - 2 * margin, Math.round(width * 0.45));
  const textX = margin + qrSize + Math.round(1.5 * DOTS_PER_MM);
  return {
    width,
    height,
    margin,
    qr: { x: margin, y: Math.round((height - qrSize) / 2), size: qrSize },
    text: { x: textX, width: width - textX - margin },
    fontPx: { name: Math.round((23 * height) / 240), body: Math.round((19 * height) / 240) },
  };
}
