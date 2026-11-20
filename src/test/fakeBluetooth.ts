/** Simulated Web Bluetooth T50 printer for tests; installs itself as navigator.bluetooth. */
export type FakeBluetoothOptions = {
  name?: string;
  /** The 8 status bytes the printer reports for INQUIRY_STA (frame bytes 14..21). */
  status?: number[];
  media?: { paperType: number; lengthMm: number; widthMm: number; gap: number };
  /** requestDevice: the user closes the chooser. */
  cancel?: boolean;
  /** requestDevice: Bluetooth is switched off. */
  bluetoothOff?: boolean;
  /** gatt.connect fails (printer off or out of range). */
  connectFails?: boolean;
  /** The printer never answers. */
  silent?: boolean;
};

const SERVICE = '0000e0ff-3c17-d293-8e48-14fe2e4da212';

export function installFakeBluetooth(initial: FakeBluetoothOptions = {}) {
  const options = { ...initial };
  const media = options.media ?? { paperType: 1, lengthMm: 40, widthMm: 30, gap: 3 };
  const writes: number[][] = [];
  const notifyListeners = new Set<(e: { target: { value: DataView } }) => void>();
  const deviceListeners = new Set<() => void>();
  let printingReplies = 0;

  const notifyChar = {
    uuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
    service: { uuid: SERVICE },
    properties: { notify: true },
    addEventListener: (_t: string, fn: (e: { target: { value: DataView } }) => void) => notifyListeners.add(fn),
    removeEventListener: (_t: string, fn: (e: { target: { value: DataView } }) => void) => notifyListeners.delete(fn),
    startNotifications: async () => notifyChar,
    stopNotifications: async () => notifyChar,
  };

  function reply(command: number) {
    const frame = new Uint8Array(64);
    frame.set([0x7e, 0x5a, 60, 0]);
    frame[7] = command;
    if (command === 0x11) {
      frame.set(options.status ?? [0, 0, 0, 0, 0, 0, 0, 0], 14);
      if (printingReplies > 0) {
        frame[16] |= 0x40;
        printingReplies--;
      }
    }
    if (command === 0x30) frame.set([0x79, 0x15, media.paperType, media.lengthMm, media.widthMm, media.gap], 37);
    setTimeout(() => notifyListeners.forEach((fn) => fn({ target: { value: new DataView(frame.buffer) } })), 5);
  }

  async function write(piece: BufferSource) {
    if (!device.gatt.connected) throw new DOMException('GATT Server is disconnected.', 'NetworkError');
    const bytes = new Uint8Array(ArrayBuffer.isView(piece) ? piece.buffer.slice(piece.byteOffset, piece.byteOffset + piece.byteLength) : piece);
    writes.push(Array.from(bytes));
    if (options.silent || !(bytes[0] === 0x7e && bytes[1] === 0x5a && bytes[2] === 0x0c)) return;
    if (bytes[7] === 0x13) printingReplies = 6; // START_PRINT
    reply(bytes[7]);
  }

  const writeChar = {
    uuid: '0000ffe9-0000-1000-8000-00805f9b34fb',
    service: { uuid: SERVICE },
    properties: { write: true, writeWithoutResponse: true },
    writeValueWithResponse: write,
    writeValueWithoutResponse: write,
  };

  const service = { getCharacteristic: async (uuid: string) => (uuid.includes('ffe9') ? writeChar : notifyChar) };

  const connect = vi.fn(async () => {
    if (options.connectFails) throw new DOMException('Connection failed for unknown reason.', 'NetworkError');
    device.gatt.connected = true;
    return {
      getPrimaryService: async (uuid: string) => {
        if (uuid === SERVICE) return service;
        throw new DOMException('No Services matching UUID found in Device.', 'NotFoundError');
      },
    };
  });

  const device = {
    id: 'fake-printer',
    name: options.name ?? 'T0205C260729L704',
    forget: vi.fn(async () => {}),
    addEventListener: (_t: string, fn: () => void) => deviceListeners.add(fn),
    removeEventListener: (_t: string, fn: () => void) => deviceListeners.delete(fn),
    gatt: {
      connected: false,
      connect,
      disconnect() {
        if (!device.gatt.connected) return;
        device.gatt.connected = false;
        deviceListeners.forEach((fn) => fn());
      },
    },
  };

  const requestDevice = vi.fn(async () => {
    if (options.bluetoothOff) throw new DOMException('Bluetooth adapter not available.', 'NotFoundError');
    if (options.cancel) throw new DOMException('User cancelled the requestDevice() chooser.', 'NotFoundError');
    return device;
  });

  Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice }, configurable: true, writable: true });

  return {
    bluetooth: navigator.bluetooth,
    device,
    writes,
    options,
    requestDevice,
    connect,
    /** Command bytes of all command frames written so far. */
    commands: () => writes.filter((w) => w[0] === 0x7e && w[1] === 0x5a && w[2] === 0x0c).map((w) => w[7]),
    /** The link drops (printer off, app in the background). */
    dropConnection: () => device.gatt.disconnect(),
    /** Delivers a gattserverdisconnected event without changing the link (a late event). */
    fireDisconnectEvent: () => deviceListeners.forEach((fn) => fn()),
    uninstall: () => {
      delete (navigator as unknown as Record<string, unknown>).bluetooth;
    },
  };
}
