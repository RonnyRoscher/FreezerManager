import { addMonths, daysBetween, monthsBetween } from './dates';
import type { ExpiryStatus } from './types';

export function expiryDate(frozenAt: string, maxMonths: number): string {
  return addMonths(frozenAt, maxMonths);
}

export function expiryStatus(frozenAt: string, maxMonths: number, today: string): ExpiryStatus {
  if (today >= addMonths(frozenAt, maxMonths)) return 'overdue';
  if (today >= addMonths(frozenAt, maxMonths - 1)) return 'soon';
  return 'ok';
}

export function formatAge(frozenAt: string, today: string): string {
  const months = monthsBetween(frozenAt, today);
  if (months < 1) {
    const days = daysBetween(frozenAt, today);
    if (days <= 0) return 'heute';
    return days === 1 ? 'vor 1 Tag' : `vor ${days} Tagen`;
  }
  if (months < 12) return months === 1 ? 'vor 1 Monat' : `vor ${months} Monaten`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'vor 1 Jahr' : `vor ${years} Jahren`;
}
