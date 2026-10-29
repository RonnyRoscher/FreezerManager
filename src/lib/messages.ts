import { InUseError } from '../data/repository';

export const SAVE_FAILED = 'Speichern fehlgeschlagen. Bitte Verbindung prüfen.';
export const NOT_IN_STOCK = 'Nicht (mehr) im Bestand';
export const PRINT_FAILED = 'Gespeichert, aber Drucken fehlgeschlagen.';
export const LOAD_FAILED = 'Daten konnten nicht geladen werden.';

export function errorMessage(e: unknown): string {
  if (e instanceof InUseError) {
    return `Kann nicht gelöscht werden: ${e.count} ${e.count === 1 ? 'Eintrag' : 'Einträge'} vorhanden`;
  }
  return SAVE_FAILED;
}
