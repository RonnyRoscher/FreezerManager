import type { ItemView } from '../domain/types';
import { PrinterUserError } from './printerMessages';
import type { MediaSize } from './printJob';
import { createUsbPrinter } from './usbPrinter';

export type { MediaSize } from './printJob';

export type PrinterState =
  | { status: 'unsupported' }
  /** `connectOnPrint`: printing connects by itself (Bluetooth asks for the printer on the first print). */
  | { status: 'disconnected'; connectOnPrint: boolean }
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
  /**
   * Makes sure a printer is connected, asking the user to pick one where needed; false when no
   * printer is available or the user cancelled. Must be called from a user gesture (a tap).
   */
  ensureConnected(): Promise<boolean>;
  /** Prints one label; rejects with a PrinterUserError carrying a German message. */
  print(item: ItemView): Promise<void>;
}

export const UNSUPPORTED_MESSAGE =
  'Direktdruck geht in Chrome oder Edge am PC (USB) und in Chrome auf Android-Handys (Bluetooth).';

/** Whether a print button can do something now. */
export function canPrint(state: PrinterState): boolean {
  return state.status === 'ready' || (state.status === 'disconnected' && state.connectOnPrint);
}

function unsupportedPrinter(): Printer {
  const state: PrinterState = { status: 'unsupported' };
  return {
    getState: () => state,
    subscribe: () => () => {},
    init: async () => {},
    connect: async () => {
      throw new PrinterUserError(UNSUPPORTED_MESSAGE);
    },
    disconnect: async () => {},
    ensureConnected: async () => false,
    print: async () => {
      throw new PrinterUserError(UNSUPPORTED_MESSAGE);
    },
  };
}

/** USB where the browser has WebHID (PC), otherwise Bluetooth where it has Web Bluetooth (Android). */
export function createPrinterService(
  apis: { hid?: HID; bluetooth?: Bluetooth } = typeof navigator !== 'undefined'
    ? { hid: navigator.hid, bluetooth: navigator.bluetooth }
    : {},
): Printer {
  if (apis.hid) return createUsbPrinter(apis.hid);
  return unsupportedPrinter();
}
