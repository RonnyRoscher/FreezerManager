import { encodeT5080Page } from './families/t5080';
import LZMA from './lzma.js';
import type { Bitmap, LabelSpec } from './types';

const label40x30: LabelSpec = {
  id: 'test',
  name: 'Test',
  lengthMm: 40,
  widthMm: 30,
  paperDirection: 1,
  paperType: 1,
  gap: 3,
  padding: { top: 0, bottom: 0, left: 0, right: 0 },
};

function bitmapWithRectangle(): Bitmap {
  const width = 320;
  const height = 240;
  const data = new Uint8Array(width * height);
  for (let y = 40; y < 200; y++) for (let x = 60; x < 260; x++) data[y * width + x] = 1;
  return { width, height, data };
}

function checksum(buf: Uint8Array): number {
  const columns = buf[4] | (buf[5] << 8);
  const len = columns * buf[6] + 14;
  let sum = 0;
  for (let j = 2; j < 14; j++) sum += buf[j];
  for (let k = 0; k < Math.floor(len / 256); k++) sum += buf[(k + 1) * 256 - 1];
  return sum & 0xffff;
}

test('compressed chunks unpack to checksummed 4096-byte print buffers', () => {
  const page = encodeT5080Page(bitmapWithRectangle(), label40x30, { density: 4, headDots: 384, printEnd: true });
  const unpacked = page.chunks.flatMap((c) => Array.from(LZMA.decompress(c) as Uint8Array));
  expect(unpacked).toHaveLength(page.buffers.length * 4096);
  expect(Uint8Array.from(unpacked)).toEqual(Uint8Array.from(page.buffers.flatMap((b) => Array.from(b))));
  for (const buf of page.buffers) expect(checksum(buf)).toBe(buf[0] | (buf[1] << 8));
  expect(page.buffers.at(-1)![2] & 0x0c).toBe(0x0c);
});
