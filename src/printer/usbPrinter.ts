import type { Printer, PrinterState } from './printerService';
import { mediaSize, printLabelJob, ROLL_NOT_RECOGNIZED, type MediaSize } from './printJob';
import { PrinterUserError, printerErrorMessage } from './printerMessages';
import { findT5080Model, SUPVAN_VENDOR_ID, type DeviceModel } from './vendor/devices';
import { T5080Driver } from './vendor/families/t5080';
import { WebHidTransport } from './vendor/transport';

const DISCONNECTED: PrinterState = { status: 'disconnected', connectOnPrint: false };
const BUSY_MESSAGE = 'Drucker ist von einem anderen Programm belegt (z. B. Katasymbol-App).';
const UNPLUGGED_MESSAGE = 'Drucker wurde getrennt.';

const hexId = (id: number) => `0x${id.toString(16).padStart(4, '0')}`;

/** Prefers the vendor-defined HID collection the printer protocol runs on. */
function pickDevice(devices: HIDDevice[]): HIDDevice | undefined {
  const supvan = devices.filter((d) => d.vendorId === SUPVAN_VENDOR_ID);
  return supvan.find((d) => d.collections.some((c) => c.usagePage === 0xff00)) ?? supvan[0];
}

/**
 * Printer on USB (WebHID, Chrome/Edge on a PC). The device is opened only for one conversation
 * (connecting, one print job) and closed again, so other programs can use the printer.
 */
export function createUsbPrinter(hid: HID): Printer {
  let state: PrinterState = DISCONNECTED;
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
      setState(DISCONNECTED);
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
    if (listening) return;
    listening = true;
    hid.addEventListener('disconnect', (e) => {
      if (e.device !== device) return;
      device = null;
      if (printing) unplugged = true;
      setState(DISCONNECTED);
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
      listen();
      await adopt(pickDevice(await hid.getDevices()));
    },
    async connect() {
      listen();
      try {
        const picked = pickDevice(await hid.requestDevice({ filters: [{ vendorId: SUPVAN_VENDOR_ID }] }));
        if (picked) await adopt(picked);
      } catch (e) {
        setState({ status: 'error', message: printerErrorMessage(e) });
      }
    },
    async disconnect() {
      const d = device;
      device = null;
      await d?.forget().catch(() => {});
      setState(DISCONNECTED);
    },
    async ensureConnected() {
      return state.status === 'ready';
    },
    async print(item) {
      if (printing) throw new PrinterUserError('Es wird bereits gedruckt.');
      if (!device || !model || state.status !== 'ready') throw new PrinterUserError('Kein Drucker verbunden.');
      printing = true;
      unplugged = false;
      const current = model;
      // Keep the last known roll when a print fails for another reason (cover open, timeout …).
      let media: MediaSize | null = state.media;
      setState({ status: 'printing', model: current.name, media });
      try {
        media = await withDriver((driver) => printLabelJob(driver, item));
      } catch (e) {
        if (e instanceof PrinterUserError && e.message === ROLL_NOT_RECOGNIZED) media = null;
        throw new PrinterUserError(unplugged ? UNPLUGGED_MESSAGE : printerErrorMessage(e));
      } finally {
        printing = false;
        if (device) setState({ status: 'ready', model: current.name, media });
      }
    },
  };
}
