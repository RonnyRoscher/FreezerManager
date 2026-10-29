import { DEFAULT_LABEL_SIZE, loadLabelSize, pageCss, saveLabelSize } from './labelSettings';

test('defaults to 62 × 29 mm', () => {
  expect(loadLabelSize()).toEqual({ widthMm: 62, heightMm: 29 });
  expect(DEFAULT_LABEL_SIZE).toEqual({ widthMm: 62, heightMm: 29 });
});

test('loads a saved size', () => {
  saveLabelSize({ widthMm: 54, heightMm: 25 });
  expect(loadLabelSize()).toEqual({ widthMm: 54, heightMm: 25 });
});

test('falls back to the default for broken storage', () => {
  localStorage.setItem('fm.labelSize', '{kaputt');
  expect(loadLabelSize()).toEqual(DEFAULT_LABEL_SIZE);
  localStorage.setItem('fm.labelSize', '{"widthMm":"x"}');
  expect(loadLabelSize()).toEqual(DEFAULT_LABEL_SIZE);
});

test('pageCss sets the page size without margins', () => {
  expect(pageCss({ widthMm: 62, heightMm: 29 })).toBe('@page { size: 62mm 29mm; margin: 0 }');
});
