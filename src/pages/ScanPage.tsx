import { useCallback, useRef, useState, type FormEvent } from 'react';
import { QrScanner } from '../components/QrScanner';
import { TakeCard } from '../components/TakeCard';
import { useRepository } from '../data/RepositoryContext';
import { parseTakeUrl } from '../domain/qrUrl';
import type { ItemView } from '../domain/types';
import { LOAD_FAILED, NOT_IN_STOCK } from '../lib/messages';

/** Ignore the same code for this long after its card was closed. */
const REPEAT_GUARD_MS = 3000;

type Result = { kind: 'item'; item: ItemView } | { kind: 'message'; text: string };

export function ScanPage() {
  const repo = useRepository();
  const [result, setResult] = useState<Result | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [code, setCode] = useState('');
  // Refs, because the scanner reports many results per second.
  const open = useRef(false);
  const lastClosed = useRef<{ id: string; at: number } | null>(null);

  const show = useCallback(async (lookup: () => Promise<ItemView | null>) => {
    open.current = true;
    try {
      const item = await lookup();
      setResult(item ? { kind: 'item', item } : { kind: 'message', text: NOT_IN_STOCK });
    } catch {
      setResult({ kind: 'message', text: LOAD_FAILED });
    }
  }, []);

  const close = useCallback(() => {
    if (result?.kind === 'item') lastClosed.current = { id: result.item.id, at: Date.now() };
    open.current = false;
    setResult(null);
  }, [result]);

  const onScan = useCallback(
    (text: string) => {
      const id = parseTakeUrl(text);
      if (!id || open.current) return;
      const last = lastClosed.current;
      if (last && last.id === id && Date.now() - last.at < REPEAT_GUARD_MS) return;
      show(() => repo.getItem(id));
    },
    [repo, show],
  );

  function search(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    show(() => repo.findItemByShortCode(code));
    setCode('');
  }

  return (
    <>
      <h1>Scannen</h1>
      {cameraError ? (
        <p className="error">Kamera nicht verfügbar. Kurzcode manuell eingeben.</p>
      ) : (
        <div className="scanner">
          <QrScanner onResult={onScan} onError={() => setCameraError(true)} />
        </div>
      )}

      {result?.kind === 'item' && (
        <div className="scan-result">
          <TakeCard key={result.item.id} item={result.item} onDone={close} />
          <button type="button" className="link-button" onClick={close}>
            Schließen
          </button>
        </div>
      )}
      {result?.kind === 'message' && (
        <div className="card scan-result">
          <span>{result.text}</span>
          <button type="button" className="link-button" onClick={close}>
            Schließen
          </button>
        </div>
      )}

      <form className="row manual" onSubmit={search}>
        <label>
          Kurzcode
          <input value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" maxLength={8} />
        </label>
        <button type="submit">Suchen</button>
      </form>
    </>
  );
}
