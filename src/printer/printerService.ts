import type { ItemView } from '../domain/types';
import { loadDensity } from './density';
import { labelBitmap } from './labelBitmap';
import { PrinterUserError, printerErrorMessage } from './printerMessages';
import { findT5080Model, SUPVAN_VENDOR_ID, type DeviceModel } from './vendor/devices';
import { T5080Driver } from './vendor/families/t5080';
import { WebHidTransport } from './vendor/transport';
import type { LabelSpec, MediaInfo } from './vendor/types';

export type MediaSize = { lengthMm: number; widthMm: number };

export type PrinterState =
  | { status: 'unsupported' }
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'ready'; model: string; media: MediaSize | null }
  | { status: 'printing'; model: string; media: MediaSize | null }
  | { status: 'error'; message: string };

export interface Printer {
  getState(): PrinterState;
  subscribe(listener: (s: PrinterState) => void): () => void;
  /** Reconnects to a printer the user granted access to earlier and follows plug events. */
  init(): Promise<void>;
  /** Asks the user to pick the printer. */
  connect(): Promise<void>;
  /** Withdraws the permission for the printer. */
  disconnect(): Promise<void>;
  /** Prints one label; rejects with a PrinterUserError carrying a German message. */
  print(item: ItemView): Promise<void>;
}

export const UNSUPPORTED_MESSAGE = 'Drucken geht nur in Chrome oder Edge am PC mit per USB angeschlossenem Drucker.';
const BUSY_MESSAGE = 'Drucker ist von einem anderen Programm belegt (z. B. Katasymbol-App).';
const UNPLUGGED_MESSAGE = 'Drucker wurde getrennt.';

const hexId = (id: number) => `0x${id.toString(16).padStart(4, '0')}`;

function mediaSize(media: MediaInfo | null): MediaSize | null {
  return media?.lengthMm && media.widthMm ? { lengthMm: media.lengthMm, widthMm: media.widthMm } : null;
}

/** Prefers the vendor-defined HID collection the printer protocol runs on. */
function pickDevice(devices: HIDDevice[]): HIDDevice | undefined {
  const supvan = devices.filter((d) => d.vendorId === SUPVAN_VENDOR_ID);
  return supvan.find((d) => d.collections.some((c) => c.usagePage === 0xff00)) ?? supvan[0];
}

export function createPrinterService(hid: HID | undefined = typeof navigator !== 'undefined' ? navigator.hid : undefined): Printer {
  let state: PrinterState = hid ? { status: 'disconnected' } : { status: 'unsupported' };
  const listeners = new Set<(s: PrinterState) => void>();
  let device: HIDDevice | null = null;
  let model: DeviceModel | null = null;
  let printing = false;
  let unplugged = false;
  let listening = false;

  function setState(next: PrinterState) {
    state = next;
    listeners.forEach((l) => l(state));
  }

  /** Opens the printer for one conversation and always closes it again. */
  async function withDriver<T>(fn: (driver: T5080Driver) => Promise<T>): Promise<T> {
    const d = device!;
    try {
      if (!d.opened) await d.open();
    } catch {
      throw new PrinterUserError(BUSY_MESSAGE);
    }
    const transport = new WebHidTransport(d);
    const driver = new T5080Driver(transport, model!.headDots);
    try {
      return await fn(driver);
    } finally {
      driver.channel.dispose();
      await transport.close().catch(() => {});
    }
  }

  async function adopt(candidate: HIDDevice | undefined) {
    if (!candidate) {
      device = null;
      setState({ status: 'disconnected' });
      return;
    }
    const found = findT5080Model(candidate.productId);
    if (!found) {
      device = null;
      setState({ status: 'error', message: `Dieses Druckermodell wird nicht unterstützt (USB-ID ${hexId(candidate.productId)}).` });
      return;
    }
    device = candidate;
    model = found;
    setState({ status: 'connecting' });
    const media = await withDriver((driver) => driver.readMedia()).catch(() => null);
    if (device === candidate) setState({ status: 'ready', model: found.name, media: mediaSize(media) });
  }

  function listen() {
    if (!hid || listening) return;
    listening = true;
    hid.addEventListener('disconnect', (e) => {
      if (e.device !== device) return;
      device = null;
      if (printing) unplugged = true;
      setState({ status: 'disconnected' });
    });
    hid.addEventListener('connect', (e) => {
      if (e.device.vendorId === SUPVAN_VENDOR_ID && !device) void adopt(e.device);
    });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async init() {
      if (!hid) return;
      listen();
      await adopt(pickDevice(await hid.getDevices()));
    },
    async connect() {
      if (!hid) throw new PrinterUserError(UNSUPPORTED_MESSAGE);
      listen();
      try {
        const picked = pickDevice(await hid.requestDevice({ filters: [{ vendorId: SUPVAN_VENDOR_ID }] }));
        if (picked) await adopt(picked);
      } catch (e) {
        setState({ status: 'error', message: printerErrorMessage(e) });
      }
    },
    async disconnect() {
      if (!hid) return;
      const d = device;
      device = null;
      await d?.forget().catch(() => {});
      setState({ status: 'disconnected' });
    },
    async print(item) {
      if (!hid) throw new PrinterUserError(UNSUPPORTED_MESSAGE);
      if (printing) throw new PrinterUserError('Es wird bereits gedruckt.');
      if (!device || !model || state.status !== 'ready') throw new PrinterUserError('Kein Drucker verbunden.');
      printing = true;
      unplugged = false;
      const current = model;
      setState({ status: 'printing', model: current.name, media: state.media });
      let media: MediaSize | null = null;
      try {
        await withDriver(async (driver) => {
          const info = await driver.readMedia();
          media = mediaSize(info);
          if (!info || !media) throw new PrinterUserError('Etikettenrolle nicht erkannt.');
          const label: LabelSpec = {
            id: String(info.labelId),
            name: '',
            lengthMm: media.lengthMm,
            widthMm: media.widthMm,
            paperDirection: 1,
            paperType: info.paperType ?? 1,
            gap: info.gap ?? 3,
            padding: { top: 0, bottom: 0, left: 0, right: 0 },
          };
          await driver.print([labelBitmap(item, media)], label, { density: loadDensity(), copies: 1 });
        });
      } catch (e) {
        throw new PrinterUserError(unplugged ? UNPLUGGED_MESSAGE : printerErrorMessage(e));
      } finally {
        printing = false;
        if (device) setState({ status: 'ready', model: current.name, media });
      }
    },
  };
}
