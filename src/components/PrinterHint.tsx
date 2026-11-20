import { Link } from 'react-router-dom';
import type { PrinterState } from '../printer/printerService';
import { canPrint, UNSUPPORTED_MESSAGE } from '../printer/printerService';

/** Explains why direct printing is unavailable; renders nothing while a printer is usable. */
export function PrinterHint({ state }: { state: PrinterState }) {
  if (canPrint(state) || state.status === 'printing' || state.status === 'connecting') return null;
  if (state.status === 'unsupported') return <p className="hint">{UNSUPPORTED_MESSAGE}</p>;
  return (
    <p className="hint">
      <Link to="/settings">Drucker in den Einstellungen verbinden</Link>
    </p>
  );
}
