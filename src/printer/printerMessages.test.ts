import { PrinterUserError, printerErrorMessage } from './printerMessages';
import { PrinterError } from './vendor/types';

test.each([
  ['Label cover is open', 'Der Deckel des Druckers ist offen.'],
  ['Label roll is not installed correctly', 'Die Etikettenrolle ist nicht richtig eingelegt.'],
  ['No label detected', 'Kein Etikett erkannt.'],
  ['Out of labels', 'Keine Etiketten mehr.'],
  ['Print head is too hot', 'Der Druckkopf ist zu heiß. Bitte kurz warten.'],
])('translates the device error "%s"', (message, text) => {
  expect(printerErrorMessage(new PrinterError(message, 'device'))).toBe(text);
});

test('explains a printer that does not answer', () => {
  expect(printerErrorMessage(new PrinterError('Printer did not respond', 'timeout'))).toBe(
    'Drucker antwortet nicht. Ist er eingeschaltet und per USB verbunden?',
  );
});

test('keeps messages that are already meant for the user', () => {
  expect(printerErrorMessage(new PrinterUserError('Etikettenrolle nicht erkannt.'))).toBe('Etikettenrolle nicht erkannt.');
});

test('falls back to the original message', () => {
  expect(printerErrorMessage(new Error('xyz'))).toBe('Drucken fehlgeschlagen: xyz');
});
