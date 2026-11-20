import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { ItemView } from '../domain/types';
import type { Printer } from './printerService';

const PrinterContext = createContext<Printer | null>(null);

export function PrinterProvider({ printer, children }: { printer: Printer; children: ReactNode }) {
  useEffect(() => {
    void printer.init();
  }, [printer]);
  return <PrinterContext.Provider value={printer}>{children}</PrinterContext.Provider>;
}

export function usePrinter() {
  const printer = useContext(PrinterContext);
  if (!printer) throw new Error('usePrinter must be used inside PrinterProvider');
  const state = useSyncExternalStore(
    (listener) => {
      const unsubscribe = printer.subscribe(listener);
      return () => void unsubscribe();
    },
    printer.getState,
  );
  return {
    state,
    connect: () => printer.connect(),
    disconnect: () => printer.disconnect(),
    print: (item: ItemView) => printer.print(item),
  };
}
