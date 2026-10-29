import { addMonths, formatDate, todayIso } from './dates';

describe('todayIso', () => {
  test('uses the local date shortly after midnight', () => {
    expect(todayIso(new Date(2026, 9, 18, 0, 30))).toBe('2026-10-18');
  });
});

describe('addMonths', () => {
  test('clamps to the last day of a short month', () => {
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
  });

  test('clamps to Feb 29 in leap years', () => {
    expect(addMonths('2027-08-31', 6)).toBe('2028-02-29');
  });

  test('keeps the day when it exists', () => {
    expect(addMonths('2026-01-15', 3)).toBe('2026-04-15');
  });
});

describe('formatDate', () => {
  test('formats as DD.MM.YYYY', () => {
    expect(formatDate('2026-10-03')).toBe('03.10.2026');
  });
});
