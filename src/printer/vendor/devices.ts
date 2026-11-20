/**
 * T50/T80 rows of the device table from khromov/supvan-katasymbol-printer-web-ui
 * (src/lib/printer/devices.ts, MIT). Only the t5080 family is supported here.
 */
export const SUPVAN_VENDOR_ID = 0x1820;

export interface DeviceModel {
  productId: number;
  name: string;
  family: 't5080';
  /** Dots per mm. */
  dpmm: 8;
  /** Print head width in dots. */
  headDots: number;
}

const t50 = (productId: number, name: string): DeviceModel => ({ productId, name, family: 't5080', dpmm: 8, headDots: 384 });
const t80 = (productId: number, name: string): DeviceModel => ({ productId, name, family: 't5080', dpmm: 8, headDots: 576 });

export const T5080_MODELS: DeviceModel[] = [
  t50(0x2072, 'T50M Plus'),
  t50(0x2074, 'T50S'),
  t50(0x2073, 'T50M Pro'),
  t50(0x2076, 'T50M Pro'),
  t50(0x2077, 'T50i'),
  t80(0x2075, 'T80M'),
  t80(0x207a, 'T80M Pro'),
  t50(0x2071, 'T50 Max'),
  t80(0x2078, 'T80M Pro'),
  t50(0x207f, 'T50M Pro'),
  t50(0x207d, 'T50 Max'),
  t50(0x2170, 'T50 Max'),
  t50(0x2070, 'T50M'),
  t80(0x2079, 'A80 Pro'),
  t80(0x207e, 'T80 Max'),
];

export function findT5080Model(productId: number): DeviceModel | undefined {
  return T5080_MODELS.find((m) => m.productId === productId);
}
