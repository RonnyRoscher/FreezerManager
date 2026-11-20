import type { ItemView } from '../domain/types';
import { loadDensity } from './density';
import { labelBitmap } from './labelBitmap';
import { PrinterUserError } from './printerMessages';
import type { LabelSpec, MediaInfo, PrinterDriver } from './vendor/types';

export const ROLL_NOT_RECOGNIZED = 'Etikettenrolle nicht erkannt.';

export type MediaSize = { lengthMm: number; widthMm: number };

export function mediaSize(media: MediaInfo | null): MediaSize | null {
  return media?.lengthMm && media.widthMm ? { lengthMm: media.lengthMm, widthMm: media.widthMm } : null;
}

/** Reads the loaded roll and prints one label on it; returns the roll size. Same for USB and Bluetooth. */
export async function printLabelJob(driver: Pick<PrinterDriver, 'readMedia' | 'print'>, item: ItemView): Promise<MediaSize> {
  const info = (await driver.readMedia?.()) ?? null;
  const size = mediaSize(info);
  if (!info || !size) throw new PrinterUserError(ROLL_NOT_RECOGNIZED);
  const label: LabelSpec = {
    id: String(info.labelId),
    name: '',
    lengthMm: size.lengthMm,
    widthMm: size.widthMm,
    paperDirection: 1,
    paperType: info.paperType ?? 1,
    gap: info.gap ?? 3,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
  };
  await driver.print([labelBitmap(item, size)], label, { density: loadDensity(), copies: 1 });
  return size;
}
