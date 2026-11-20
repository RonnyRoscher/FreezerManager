import { printLabelJob } from './printJob';
import { makeItem } from '../test/fixtures';
import type { MediaInfo } from './vendor/types';

function driverWith(media: Partial<MediaInfo>) {
  return {
    readMedia: vi.fn(async () => ({ labelId: 5497, paperType: 1, lengthMm: 40, widthMm: 30, gap: 3, raw: new Uint8Array(), ...media })),
    print: vi.fn(async () => {}),
  };
}

test('prints the label in the size of the roll', async () => {
  const driver = driverWith({});
  await expect(printLabelJob(driver, makeItem())).resolves.toEqual({ lengthMm: 40, widthMm: 30 });
  const [pages, label, options] = driver.print.mock.calls[0] as unknown as [{ width: number; height: number }[], object, object];
  expect(pages[0].width).toBe(320);
  expect(pages[0].height).toBe(240);
  expect(label).toMatchObject({ lengthMm: 40, widthMm: 30, paperDirection: 1, paperType: 1, gap: 3 });
  expect(options).toMatchObject({ density: 4, copies: 1 });
});

test('refuses to print without a recognized roll', async () => {
  const driver = driverWith({ lengthMm: 0, widthMm: 0 });
  await expect(printLabelJob(driver, makeItem())).rejects.toThrow('Etikettenrolle nicht erkannt.');
  expect(driver.print).not.toHaveBeenCalled();
});
