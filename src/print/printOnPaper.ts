import type { ItemView } from '../domain/types';
import { drawLabel } from '../printer/labelBitmap';
import type { LabelSizeMm } from '../printer/labelLayout';

/** Used when no label printer tells us the roll size. */
export const PAPER_FALLBACK_SIZE: LabelSizeMm = { lengthMm: 40, widthMm: 30 };

export function paperPageCss(): string {
  return '@page { size: A4; margin: 10mm }';
}

/**
 * Emergency printing on a normal printer: one label at its real size in the top left corner
 * of an A4 page, with a dashed cutting line. Uses the same drawing as the label printer.
 */
export async function printOnPaper(item: ItemView, size: LabelSizeMm): Promise<void> {
  const canvas = document.createElement('canvas');
  drawLabel(canvas, item, size, 3);

  // The previous page stays in the (screen-hidden) container until now: browsers fire
  // afterprint before the print preview is done, so removing it there prints a blank page.
  document.getElementById('print-root')?.remove();
  const container = document.createElement('div');
  container.id = 'print-root';
  const style = document.createElement('style');
  style.textContent = paperPageCss();
  const frame = document.createElement('div');
  frame.className = 'paper-label';
  const img = document.createElement('img');
  img.alt = 'Etikett';
  img.src = canvas.toDataURL('image/png');
  img.style.width = `${size.lengthMm}mm`;
  img.style.height = `${size.widthMm}mm`;
  frame.appendChild(img);
  container.append(style, frame);
  document.body.appendChild(container);

  await img.decode?.().catch(() => undefined);
  window.print();
}
