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

/**
 * Bluetooth name prefixes of the T50 printers (BT_NAME_PREFIXES of the original devices.ts, from
 * the Katasymbol Android app's device tables). All of them have a 384-dot head. The name is the
 * prefix plus a serial, e.g. "T0205C260729L704".
 */
const BT_NAME_PREFIXES: [string, string][] = [
  ...['T0096A', 'T0117A', 'T0118A', 'T0129A', 'T0147B', 'T0148', 'T0170', 'T0178', 'T0205', 'T0211', 'T0212', 'T0213', 'T0221', 'T0162B', 'T0163B', 'T0112A', 'T0101A'].map(
    (p) => [p, 'T50M Pro'] as [string, string],
  ),
  ...['T0046A', 'T0149B', 'T0159B', 'T0200', 'T0100A', 'T0145B', 'T0150B', 'T0201', 'T0151B', 'T0113A', 'T0152B', 'T0160B', 'T0202'].map(
    (p) => [p, 'T50 Pro'] as [string, string],
  ),
  ...['T0097A', 'T0153B', 'T0161B', 'T0206', 'T0154B', 'T0114A', 'T0146B', 'T0155B', 'T0115A', 'T0156B'].map(
    (p) => [p, 'A50 Pro'] as [string, string],
  ),
];

/** Model name for a T50 printer's Bluetooth name; undefined for any other printer. */
export function bluetoothModelName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  return BT_NAME_PREFIXES.find(([prefix]) => name.startsWith(prefix))?.[1];
}
