import { DEFAULT_DENSITY, loadDensity, saveDensity } from './density';

test('defaults to 4', () => {
  expect(DEFAULT_DENSITY).toBe(4);
  expect(loadDensity()).toBe(4);
});

test('loads a saved density', () => {
  saveDensity(7);
  expect(loadDensity()).toBe(7);
});

test('clamps out-of-range values and ignores garbage', () => {
  localStorage.setItem('fm.printDensity', '12');
  expect(loadDensity()).toBe(9);
  localStorage.setItem('fm.printDensity', 'x');
  expect(loadDensity()).toBe(4);
});
