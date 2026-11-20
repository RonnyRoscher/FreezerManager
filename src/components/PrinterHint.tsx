import { Link } from 'react-router-dom';
import type { PrinterState } from '../printer/printerService';
import { UNSUPPORTED_MESSAGE } from '../printer/printerService';

/** Explains why direct printing is unavailable; renders nothing while a printer is usable. */
export function PrinterHint({ state }: { state: PrinterState }) {
  if (state.status === 'ready' || state.status === 'printing') return null;
  if (state.status === 'unsupported') return <p className="hint">{UNSUPPORTED_MESSAGE}</p>;
  return (
    <p className="hint">
      <Link to="/settings">Drucker in den Einstellungen verbinden</Link>
    </p>
  );
}
