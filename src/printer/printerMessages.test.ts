import { bluetoothErrorMessage, isChooserCancelled, PrinterUserError, printerErrorMessage } from './printerMessages';
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

describe('Bluetooth', () => {
  const cancelled = new DOMException('User cancelled the requestDevice() chooser.', 'NotFoundError');
  const adapterOff = new DOMException('Bluetooth adapter not available.', 'NotFoundError');

  test('recognizes a cancelled chooser', () => {
    expect(isChooserCancelled(cancelled)).toBe(true);
    expect(isChooserCancelled(adapterOff)).toBe(false);
  });

  test('says when Bluetooth is off', () => {
    expect(bluetoothErrorMessage(adapterOff)).toBe('Bluetooth ist ausgeschaltet. Bitte am Handy einschalten.');
  });

  test('says when the printer cannot be reached', () => {
    expect(bluetoothErrorMessage(new DOMException('GATT Server is disconnected.', 'NetworkError'))).toBe(
      'Drucker per Bluetooth nicht erreichbar. Ist er eingeschaltet und in der Nähe?',
    );
  });

  test('says when the printer does not answer', () => {
    expect(bluetoothErrorMessage(new PrinterError('Printer did not respond over Bluetooth', 'timeout'))).toBe(
      'Drucker antwortet nicht. Ist er eingeschaltet und in der Nähe?',
    );
  });

  test('translates device errors like USB', () => {
    expect(bluetoothErrorMessage(new PrinterError('Label cover is open', 'device'))).toBe('Der Deckel des Druckers ist offen.');
  });
});

describe('remaining English driver messages', () => {
  test.each([
    [new PrinterError('Printer is already printing, try again shortly', 'busy'), 'Der Drucker druckt gerade noch. Bitte kurz warten.'],
    [new PrinterError('Printing was stopped on the device', 'stopped'), 'Der Druck wurde am Drucker abgebrochen.'],
    [new PrinterError('Cancelled', 'cancelled'), 'Der Druck wurde abgebrochen.'],
    [new PrinterError('This design is too detailed for the T50M to take in one transfer', 'label'), 'Das Etikett ist zu detailliert für den Drucker.'],
    [new PrinterError('Label not recognized', 'device'), 'Etikett nicht erkannt. Ist eine passende Katasymbol-Rolle eingelegt?'],
    [new PrinterError('Check remaining labels', 'device'), 'Bitte die verbleibenden Etiketten prüfen.'],
  ])('%s', (error, text) => {
    expect(printerErrorMessage(error)).toBe(text);
  });
});
