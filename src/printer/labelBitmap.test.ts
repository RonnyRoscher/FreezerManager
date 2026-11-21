import { drawLabel, labelBitmap } from './labelBitmap';
import { makeItem } from '../test/fixtures';

const size = { lengthMm: 40, widthMm: 30 };

function blackIn(bitmap: { width: number; data: Uint8Array }, x0: number, x1: number, y0: number, y1: number) {
  let count = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) count += bitmap.data[y * bitmap.width + x];
  return count;
}

test('renders a 40 × 30 mm label at 8 dots per mm', () => {
  const bitmap = labelBitmap(makeItem(), size);
  expect(bitmap.width).toBe(320);
  expect(bitmap.height).toBe(240);
  expect(bitmap.data).toHaveLength(76800);
});

test('keeps the edges white', () => {
  const bitmap = labelBitmap(makeItem(), size);
  expect(bitmap.data[0]).toBe(0);
  expect(blackIn(bitmap, 319, 319, 0, 239)).toBe(0);
});

test('draws the QR code and the text', () => {
  const bitmap = labelBitmap(makeItem(), size);
  expect(blackIn(bitmap, 8, 151, 48, 191)).toBeGreaterThan(0);
  expect(blackIn(bitmap, 164, 311, 0, 239)).toBeGreaterThan(0);
});

test('encodes the item in the QR code', () => {
  const a = labelBitmap(makeItem({ id: '0b9f8c1e-5d1a-4c7e-9a7b-2f1e3d4c5b6a' }), size);
  const b = labelBitmap(makeItem({ id: '1c0a9d2f-6e2b-4d8f-8b8c-3a2f4e5d6c7b' }), size);
  const qr = (bm: typeof a) => Array.from({ length: 144 }, (_, y) => bm.data.slice((48 + y) * 320 + 8, (48 + y) * 320 + 152).join('')).join('');
  expect(qr(a)).not.toBe(qr(b));
});

test('draws at a higher resolution for paper printing', () => {
  const canvas = document.createElement('canvas');
  drawLabel(canvas, makeItem(), size, 3);
  expect(canvas.width).toBe(960);
  expect(canvas.height).toBe(720);
});

test('prints the short code in a sans-serif font that Android has', () => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fonts: Record<string, string> = {};
  const fillText = ctx.fillText.bind(ctx);
  ctx.fillText = (text: string, x: number, y: number) => {
    fonts[text] = ctx.font;
    fillText(text, x, y);
  };
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx);
  drawLabel(canvas, makeItem({ short_code: 'K7F3' }), size);
  expect(fonts.K7F3).toMatch(/bold/);
  expect(fonts.K7F3).toMatch(/Arial/);
  expect(fonts.K7F3).not.toMatch(/Courier/);
});

function drawnTexts(item: Parameters<typeof drawLabel>[1]) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const texts: string[] = [];
  const fillText = ctx.fillText.bind(ctx);
  ctx.fillText = (text: string, x: number, y: number) => {
    texts.push(text);
    fillText(text, x, y);
  };
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx);
  drawLabel(canvas, item, size);
  return texts;
}

test('leaves out the category', () => {
  expect(drawnTexts(makeItem())).not.toContain('Fleisch');
});

test('keeps the quantity on its own line and gives the details two lines', () => {
  const texts = drawnTexts(makeItem({ quantity: '200g', details: '50% Fichtenreizker, Rest Maronen und Steinpilze' }));
  const quantity = texts.indexOf('200g');
  expect(quantity).toBeGreaterThan(-1);
  expect(texts[quantity + 1]).toMatch(/^50%/);
  expect(texts[quantity + 2]).toBeDefined();
  expect(texts[quantity + 2]).not.toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  expect(texts.join(' ')).toContain('Fichtenreizker');
});
