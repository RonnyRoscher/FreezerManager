import { PrinterError } from './vendor/types';

/** An error whose message is already written for the user (German). */
export class PrinterUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrinterUserError';
  }
}

export const NO_RESPONSE = 'Drucker antwortet nicht. Ist er eingeschaltet und per USB verbunden?';

const DEVICE_ERRORS: Record<string, string> = {
  'Label cover is open': 'Der Deckel des Druckers ist offen.',
  'Label roll is not installed correctly': 'Die Etikettenrolle ist nicht richtig eingelegt.',
  'No label detected': 'Kein Etikett erkannt.',
  'Out of labels': 'Keine Etiketten mehr.',
  'Print head is too hot': 'Der Druckkopf ist zu heiß. Bitte kurz warten.',
};

export function printerErrorMessage(e: unknown): string {
  if (e instanceof PrinterUserError) return e.message;
  if (e instanceof PrinterError) {
    if (e.code === 'timeout') return NO_RESPONSE;
    // The driver joins several device errors with ", "; the first one is the most important.
    const first = e.message.split(', ')[0];
    if (DEVICE_ERRORS[first]) return DEVICE_ERRORS[first];
  }
  return `Drucken fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
}
