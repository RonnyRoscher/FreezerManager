import type { Printer, PrinterState } from './printerService';
import { mediaSize, printLabelJob } from './printJob';
import { bluetoothErrorMessage, isChooserCancelled, PrinterUserError } from './printerMessages';
import { WebBluetoothTransport } from './vendor/ble';
import { bluetoothModelName } from './vendor/devices';
import { T5080BtDriver } from './vendor/families/t5080-bt';

const DISCONNECTED: PrinterState = { status: 'disconnected', connectOnPrint: true };
const UNSUPPORTED_MODEL = 'Dieses Druckermodell wird nicht unterstützt.';
const LINK_LOST = 'Drucker wurde getrennt.';

const userMessage = (e: unknown) => (e instanceof PrinterUserError ? e.message : bluetoothErrorMessage(e));

/**
 * Printer on Bluetooth (Web Bluetooth, Chrome on Android). Chrome forgets the printer when the app
 * restarts, so the first print after opening asks for it; the link then stays open, and a dropped
 * link is re-established without asking again.
 */
export function createBluetoothPrinter(): Printer {
  let state: PrinterState = DISCONNECTED;
  const listeners = new Set<(s: PrinterState) => void>();
  let device: BluetoothDevice | null = null;
  let model = '';
  let transport: WebBluetoothTransport | null = null;
  let driver: T5080BtDriver | null = null;
  let printing = false;
  let linkLost = false;

  function setState(next: PrinterState) {
    state = next;
    listeners.forEach((l) => l(state));
  }

  function onLinkLost() {
    driver?.channel.dispose();
    driver = null;
    transport = null;
    if (printing) linkLost = true;
    setState(DISCONNECTED);
  }

  /** Shows the chooser; null when the user cancels. */
  async function choose(): Promise<BluetoothDevice | null> {
    try {
      return await WebBluetoothTransport.request();
    } catch (e) {
      if (isChooserCancelled(e)) return null;
      throw new PrinterUserError(bluetoothErrorMessage(e));
    }
  }

  async function open(d: BluetoothDevice) {
    const t = await WebBluetoothTransport.open(d);
    const drv = new T5080BtDriver(t, 384, { acksDataFrames: false, commandTimeoutMs: 4000 });
    try {
      await drv.handshake();
      const info = await drv.readMedia();
      transport = t;
      driver = drv;
      setState({ status: 'ready', model, media: mediaSize(info) });
    } catch (e) {
      drv.channel.dispose();
      await t.close().catch(() => {});
      throw e;
    }
  }

  async function ensureConnected(): Promise<boolean> {
    if (driver) return true;
    let d = device;
    if (!d) {
      d = await choose();
      if (!d) return false;
      const name = bluetoothModelName(d.name);
      if (!name) throw new PrinterUserError(UNSUPPORTED_MODEL);
      device = d;
      model = name;
      d.addEventListener('gattserverdisconnected', () => {
        if (device === d) onLinkLost();
      });
    }
    setState({ status: 'connecting' });
    try {
      await open(d);
    } catch (e) {
      setState(DISCONNECTED);
      throw new PrinterUserError(userMessage(e));
    }
    return true;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async init() {},
    async connect() {
      await ensureConnected();
    },
    async disconnect() {
      const d = device;
      const t = transport;
      device = null;
      driver?.channel.dispose();
      driver = null;
      transport = null;
      await t?.close().catch(() => {});
      await d?.forget?.().catch(() => {});
      setState(DISCONNECTED);
    },
    ensureConnected,
    async print(item) {
      if (printing) throw new PrinterUserError('Es wird bereits gedruckt.');
      printing = true;
      linkLost = false;
      try {
        if (!(await ensureConnected())) return;
        const media = state.status === 'ready' ? state.media : null;
        setState({ status: 'printing', model, media });
        try {
          const printed = await printLabelJob(driver!, item);
          setState({ status: 'ready', model, media: printed });
        } catch (e) {
          if (driver) setState({ status: 'ready', model, media });
          throw new PrinterUserError(linkLost ? LINK_LOST : userMessage(e));
        }
      } finally {
        printing = false;
      }
    },
  };
}
