import type { Printer, PrinterState } from '../printer/printerService';

/** Printer stub for page tests; defaults to a connected T50M Pro with a 40 × 30 mm roll. */
export function fakePrinter(
  initial: PrinterState = { status: 'ready', model: 'T50M Pro', media: { lengthMm: 40, widthMm: 30 } },
) {
  let state = initial;
  const listeners = new Set<(s: PrinterState) => void>();
  return {
    getState: () => state,
    subscribe(listener: (s: PrinterState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    init: vi.fn(async () => {}),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    ensureConnected: vi.fn(async () => true),
    print: vi.fn<Printer['print']>(async () => {}),
    setState(next: PrinterState) {
      state = next;
      listeners.forEach((l) => l(state));
    },
  } satisfies Printer & { setState(s: PrinterState): void };
}
