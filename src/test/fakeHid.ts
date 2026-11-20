/** Simulated WebHID printer for tests: answers every report like a Supvan T50 does. */
export type FakeHidOptions = {
  productId?: number;
  /** The 8 status bytes the printer reports for INQUIRY_STA. */
  status?: number[];
  media?: { lengthMm: number; widthMm: number; paperType: number; gap: number };
  /** Never answer (printer switched off mid-way). */
  silent?: boolean;
  /** Opening fails (device used by another program). */
  openFails?: boolean;
  /** Whether permission was granted earlier, so getDevices() returns the device. */
  granted?: boolean;
};

type Listener = (e: { device: HIDDevice; data?: DataView }) => void;

export function createFakeHid(options: FakeHidOptions = {}) {
  const sent: number[][] = [];
  const media = options.media ?? { lengthMm: 40, widthMm: 30, paperType: 1, gap: 3 };
  let granted = options.granted ?? true;
  let plugged = true;
  let printingReports = 0;
  const reportListeners = new Set<Listener>();
  const hidListeners = { connect: new Set<Listener>(), disconnect: new Set<Listener>() };

  const device = {
    vendorId: 0x1820,
    productId: options.productId ?? 0x207f,
    productName: 'USB Device',
    collections: [{ usagePage: 0xff00 }],
    opened: false,
    open: vi.fn(async () => {
      if (options.openFails) throw new DOMException('Failed to open the device.', 'InvalidStateError');
      device.opened = true;
    }),
    close: vi.fn(async () => {
      device.opened = false;
    }),
    forget: vi.fn(async () => {
      granted = false;
      device.opened = false;
    }),
    addEventListener: (_type: string, fn: Listener) => reportListeners.add(fn),
    removeEventListener: (_type: string, fn: Listener) => reportListeners.delete(fn),
    sendReport: vi.fn(async (_reportId: number, data: BufferSource) => {
      if (!plugged || !device.opened) throw new DOMException('The device was disconnected.', 'NotFoundError');
      const bytes = new Uint8Array(ArrayBuffer.isView(data) ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data);
      sent.push(Array.from(bytes));
      if (options.silent) return;
      const reply = new Uint8Array(64);
      if (bytes[0] === 0xc0 && bytes[1] === 0x40) {
        const command = bytes[4];
        if (command === 0x13) printingReports = 1; // START_PRINT
        if (command === 0x11) {
          reply.set(options.status ?? [0, 0, 0, 0, 0, 0, 0, 0], 1);
          if (printingReports > 0) {
            reply[3] |= 0x40;
            printingReports--;
          }
        }
        if (command === 0x30) reply.set([media.paperType, media.lengthMm, media.widthMm, media.gap], 18);
      }
      setTimeout(() => reportListeners.forEach((fn) => fn({ device: device as unknown as HIDDevice, data: new DataView(reply.buffer) })), 2);
    }),
  };

  const hid = {
    getDevices: vi.fn(async () => (plugged && granted ? [device] : [])),
    requestDevice: vi.fn(async () => {
      if (!plugged) return [];
      granted = true;
      return [device];
    }),
    addEventListener: (type: 'connect' | 'disconnect', fn: Listener) => hidListeners[type].add(fn),
    removeEventListener: (type: 'connect' | 'disconnect', fn: Listener) => hidListeners[type].delete(fn),
  };

  return {
    hid: hid as unknown as HID,
    device,
    sent,
    /** Command bytes of all C0 40 frames sent so far. */
    commands: () => sent.filter((r) => r[0] === 0xc0 && r[1] === 0x40).map((r) => r[4]),
    unplug() {
      plugged = false;
      device.opened = false;
      hidListeners.disconnect.forEach((fn) => fn({ device: device as unknown as HIDDevice }));
    },
    plug() {
      plugged = true;
      hidListeners.connect.forEach((fn) => fn({ device: device as unknown as HIDDevice }));
    },
  };
}
