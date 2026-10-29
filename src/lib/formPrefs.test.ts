import { loadFormPrefs, saveFormPrefs } from './formPrefs';

test('returns empty prefs by default', () => {
  expect(loadFormPrefs()).toEqual({});
});

test('round-trips saved prefs', () => {
  saveFormPrefs({ categoryId: 'c', freezerId: 'f', compartmentId: 'x' });
  expect(loadFormPrefs()).toEqual({ categoryId: 'c', freezerId: 'f', compartmentId: 'x' });
});

test('ignores broken storage', () => {
  localStorage.setItem('fm.formPrefs', 'nope{');
  expect(loadFormPrefs()).toEqual({});
});
