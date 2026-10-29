import { expiryStatus, formatAge } from './expiry';

describe('expiryStatus', () => {
  test.each([
    ['2026-05-31', 'ok'],
    ['2026-06-01', 'soon'],
    ['2026-06-30', 'soon'],
    ['2026-07-01', 'overdue'],
  ])('frozen 2026-01-01 for 6 months, on %s → %s', (today, status) => {
    expect(expiryStatus('2026-01-01', 6, today)).toBe(status);
  });
});

describe('formatAge', () => {
  test.each([
    ['2026-10-18', 'heute'],
    ['2026-10-17', 'vor 1 Tag'],
    ['2026-09-28', 'vor 20 Tagen'],
    ['2026-09-18', 'vor 1 Monat'],
    ['2026-06-18', 'vor 4 Monaten'],
    ['2025-10-18', 'vor 1 Jahr'],
    ['2024-08-18', 'vor 2 Jahren'],
  ])('frozen %s → %s', (frozenAt, text) => {
    expect(formatAge(frozenAt, '2026-10-18')).toBe(text);
  });
});
