import { labelGeometry, labelLines, wrapText } from './labelLayout';
import { makeItem } from '../test/fixtures';

describe('labelLines', () => {
  test('joins quantity and details', () => {
    const lines = labelLines(makeItem({ quantity: '500 g', details: 'mit Zwiebeln', frozen_at: '2026-10-03' }));
    expect(lines.extra).toBe('500 g · mit Zwiebeln');
    expect(lines.location).toBe('Keller-Truhe › Schublade 2');
    expect(lines.date).toBe('03.10.2026');
    expect(lines.category).toBe('Fleisch');
  });

  test('omits the separator when only details are set', () => {
    expect(labelLines(makeItem({ quantity: null, details: 'mit Zwiebeln' })).extra).toBe('mit Zwiebeln');
  });

  test('has no extra line without quantity and details', () => {
    expect(labelLines(makeItem({ quantity: null, details: null })).extra).toBeNull();
  });
});

describe('wrapText', () => {
  const m = (s: string) => s.length * 10;

  test('keeps short text on one line', () => {
    expect(wrapText('Hackfleisch', 200, m, 2)).toEqual(['Hackfleisch']);
  });

  test('wraps at spaces', () => {
    expect(wrapText('Keller-Truhe › Schublade 2', 150, m, 2)).toEqual(['Keller-Truhe ›', 'Schublade 2']);
  });

  test('breaks words that are wider than the line', () => {
    expect(wrapText('Rinderrouladen', 100, m, 2)).toEqual(['Rinderroul', 'aden']);
  });

  test('shortens the last allowed line with an ellipsis', () => {
    const lines = wrapText('eins zwei drei vier fünf sechs', 100, m, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    for (const line of lines) expect(m(line)).toBeLessThanOrEqual(100);
  });
});

describe('labelGeometry', () => {
  test('lays out a 40 × 30 mm label in printer dots', () => {
    expect(labelGeometry({ lengthMm: 40, widthMm: 30 })).toEqual({
      width: 320,
      height: 240,
      margin: 8,
      qr: { x: 8, y: 48, size: 144 },
      text: { x: 164, width: 148 },
      fontPx: { name: 23, body: 19 },
    });
  });

  test('uses the label height for the QR code on wide labels', () => {
    expect(labelGeometry({ lengthMm: 62, widthMm: 29 }).qr.size).toBe(216);
  });
});
