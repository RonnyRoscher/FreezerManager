import { useEffect, useState } from 'react';
import { useRepository } from '../data/RepositoryContext';
import type { Item, ItemView } from '../domain/types';
import { NOT_IN_STOCK, SAVE_FAILED } from '../lib/messages';
import { locationText } from './ItemRow';

export const UNDO_MS = 8000;

type State =
  | { kind: 'confirm'; notice?: string }
  | { kind: 'busy' }
  | { kind: 'removed'; removed: Item }
  | { kind: 'done' }
  | { kind: 'gone' }
  | { kind: 'error'; message: string };

type Props = { item: ItemView; onDone?: () => void; showSummary?: boolean };

/** Confirms removal of an item and offers a short-lived undo. */
export function TakeCard({ item, onDone, showSummary = true }: Props) {
  const repo = useRepository();
  const [state, setState] = useState<State>({ kind: 'confirm' });

  useEffect(() => {
    if (state.kind !== 'removed') return;
    const timer = setTimeout(() => {
      setState({ kind: 'done' });
      onDone?.();
    }, UNDO_MS);
    return () => clearTimeout(timer);
  }, [state, onDone]);

  async function take() {
    setState({ kind: 'busy' });
    try {
      const removed = await repo.removeItem(item.id);
      setState(removed ? { kind: 'removed', removed } : { kind: 'gone' });
    } catch {
      setState({ kind: 'error', message: SAVE_FAILED });
    }
  }

  async function undo(removed: Item) {
    setState({ kind: 'busy' });
    try {
      await repo.restoreItem(removed);
      setState({ kind: 'confirm', notice: 'Rückgängig gemacht' });
    } catch {
      setState({ kind: 'error', message: SAVE_FAILED });
    }
  }

  if (state.kind === 'gone') return <div className="card take-card">{NOT_IN_STOCK}</div>;

  if (state.kind === 'done') {
    return (
      <div className="card take-card removed" role="status">
        {item.name} entnommen
      </div>
    );
  }

  if (state.kind === 'removed') {
    return (
      <div className="card take-card removed" role="status">
        <span>{item.name} entnommen</span>
        <button type="button" className="secondary" onClick={() => undo(state.removed)}>
          Rückgängig
        </button>
      </div>
    );
  }

  return (
    <div className="card take-card">
      {showSummary && (
        <div className="take-summary">
          <strong>{item.name}</strong>
          {item.quantity && <span>{item.quantity}</span>}
          <span>{locationText(item)}</span>
          <span className="code">{item.short_code}</span>
        </div>
      )}
      {state.kind === 'confirm' && state.notice && <p className="notice">{state.notice}</p>}
      {state.kind === 'error' && <p className="error">{state.message}</p>}
      <button type="button" className="take-button" disabled={state.kind === 'busy'} onClick={take}>
        Entnehmen
      </button>
    </div>
  );
}
