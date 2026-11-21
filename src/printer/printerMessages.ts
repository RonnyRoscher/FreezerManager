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
  'Label not recognized': 'Etikett nicht erkannt. Ist eine passende Katasymbol-Rolle eingelegt?',
  'Check remaining labels': 'Bitte die verbleibenden Etiketten prüfen.',
};

const CODE_ERRORS: Record<string, string> = {
  busy: 'Der Drucker druckt gerade noch. Bitte kurz warten.',
  stopped: 'Der Druck wurde am Drucker abgebrochen.',
  cancelled: 'Der Druck wurde abgebrochen.',
  label: 'Das Etikett ist zu detailliert für den Drucker.',
};

export function printerErrorMessage(e: unknown): string {
  if (e instanceof PrinterUserError) return e.message;
  if (e instanceof PrinterError) {
    if (e.code === 'timeout') return NO_RESPONSE;
    if (CODE_ERRORS[e.code]) return CODE_ERRORS[e.code];
    // The driver joins several device errors with ", "; the first one is the most important.
    const first = e.message.split(', ')[0];
    if (DEVICE_ERRORS[first]) return DEVICE_ERRORS[first];
  }
  return `Drucken fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
}

export const BLUETOOTH_OFF = 'Bluetooth ist ausgeschaltet. Bitte am Handy einschalten.';
export const BLUETOOTH_UNREACHABLE = 'Drucker per Bluetooth nicht erreichbar. Ist er eingeschaltet und in der Nähe?';
export const BLUETOOTH_NO_RESPONSE = 'Drucker antwortet nicht. Ist er eingeschaltet und in der Nähe?';

const domErrorName = (e: unknown) => (e instanceof DOMException || e instanceof Error ? e.name : '');

/** The user closed the browser's printer chooser without picking one. */
export function isChooserCancelled(e: unknown): boolean {
  return domErrorName(e) === 'NotFoundError' && /cancel/i.test((e as Error).message);
}

export function bluetoothErrorMessage(e: unknown): string {
  const name = domErrorName(e);
  if (name === 'NotSupportedError') return BLUETOOTH_OFF;
  if (name === 'NotFoundError' && /adapter|not available/i.test((e as Error).message)) return BLUETOOTH_OFF;
  if (name === 'NetworkError') return BLUETOOTH_UNREACHABLE;
  if (e instanceof PrinterError && e.code === 'timeout') return BLUETOOTH_NO_RESPONSE;
  return printerErrorMessage(e);
}
