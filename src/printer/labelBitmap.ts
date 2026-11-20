import QRCode from 'qrcode';
import { appBaseUrl, buildTakeUrl } from '../domain/qrUrl';
import type { ItemView } from '../domain/types';
import { labelGeometry, labelLines, wrapText, type LabelSizeMm } from './labelLayout';
import { rgbaToBitmap } from './vendor/bitmap';
import type { Bitmap } from './vendor/types';

const SANS = 'Arial, Helvetica, sans-serif';
const LINE_HEIGHT = 1.2;

type TextLine = { text: string; font: string; size: number };

/**
 * Draws a label in printer dots (8 per mm). `scale` multiplies the canvas resolution, e.g. 3
 * for a sharper image on paper; the layout stays the same.
 */
export function drawLabel(canvas: HTMLCanvasElement, item: ItemView, size: LabelSizeMm, scale = 1): void {
  const g = labelGeometry(size);
  canvas.width = g.width * scale;
  canvas.height = g.height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, g.width, g.height);
  ctx.fillStyle = '#000';

  // QR code from its module matrix: whole dots per module keep the edges sharp.
  const qr = QRCode.create(buildTakeUrl(appBaseUrl(), item.id), { errorCorrectionLevel: 'M' }).modules;
  const moduleSize = Math.floor(g.qr.size / qr.size);
  const offset = Math.floor((g.qr.size - moduleSize * qr.size) / 2);
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (qr.get(row, col)) {
        ctx.fillRect(g.qr.x + offset + col * moduleSize, g.qr.y + offset + row * moduleSize, moduleSize, moduleSize);
      }
    }
  }

  const content = labelLines(item);
  const wrap = (text: string, font: string, size: number, maxLines: number): TextLine[] => {
    ctx.font = font;
    return wrapText(text, g.text.width, (s) => ctx.measureText(s).width, maxLines).map((t) => ({ text: t, font, size }));
  };
  const nameFont = `bold ${g.fontPx.name}px ${SANS}`;
  const bodyFont = `${g.fontPx.body}px ${SANS}`;
  const lines: TextLine[] = [
    ...wrap(content.name, nameFont, g.fontPx.name, 2),
    ...(content.extra ? wrap(content.extra, bodyFont, g.fontPx.body, 1) : []),
    ...wrap(content.category, bodyFont, g.fontPx.body, 1),
    ...wrap(content.date, bodyFont, g.fontPx.body, 1),
    ...wrap(content.location, bodyFont, g.fontPx.body, 2),
    // Sans-serif: Android has no Courier New and would fall back to a serif font.
    ...wrap(content.code, `bold ${g.fontPx.body}px ${SANS}`, g.fontPx.body, 1),
  ];

  const blockHeight = lines.reduce((h, l) => h + l.size * LINE_HEIGHT, 0);
  let y = Math.max(g.margin, (g.height - blockHeight) / 2);
  ctx.textBaseline = 'top';
  for (const line of lines) {
    ctx.font = line.font;
    ctx.fillText(line.text, g.text.x, y + (line.size * (LINE_HEIGHT - 1)) / 2);
    y += line.size * LINE_HEIGHT;
  }
}

/** The label as a 1-bit bitmap for the printer. */
export function labelBitmap(item: ItemView, size: LabelSizeMm): Bitmap {
  const canvas = document.createElement('canvas');
  drawLabel(canvas, item, size);
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  return rgbaToBitmap(data, canvas.width, canvas.height);
}
