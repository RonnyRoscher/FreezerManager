import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { locationText } from '../components/ItemRow';
import { TakeCard } from '../components/TakeCard';
import { useRepository } from '../data/RepositoryContext';
import { formatDate, todayIso } from '../domain/dates';
import { expiryDate, expiryStatus, formatAge } from '../domain/expiry';
import type { ItemView } from '../domain/types';
import { LOAD_FAILED, NOT_IN_STOCK } from '../lib/messages';
import { PrinterHint } from '../components/PrinterHint';
import { printerErrorMessage } from '../printer/printerMessages';
import { canPrint } from '../printer/printerService';
import { usePrinter } from '../printer/PrinterContext';
import { PAPER_FALLBACK_SIZE, printOnPaper } from '../print/printOnPaper';

export function ItemDetailPage() {
  const repo = useRepository();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const [item, setItem] = useState<ItemView | null | undefined>(undefined);
  const [error, setError] = useState('');
  const printer = usePrinter();
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');

  useEffect(() => {
    repo
      .getItem(id)
      .then(setItem)
      .catch(() => setError(LOAD_FAILED));
  }, [repo, id]);

  if (error) return <p className="error">{error}</p>;
  if (item === undefined) return <p className="status">Laden …</p>;
  if (item === null) {
    return (
      <div className="card">
        <p>{NOT_IN_STOCK}</p>
        <Link to="/">Zur Übersicht</Link>
      </div>
    );
  }

  const today = todayIso();
  const status = expiryStatus(item.frozen_at, item.category.max_months, today);

  return (
    <>
      <h1>{item.name}</h1>
      <dl className={`card details status-${status}`}>
        {item.quantity && (
          <>
            <dt>Menge</dt>
            <dd>{item.quantity}</dd>
          </>
        )}
        {item.details && (
          <>
            <dt>Details</dt>
            <dd>{item.details}</dd>
          </>
        )}
        <dt>Kategorie</dt>
        <dd>{item.category.name}</dd>
        <dt>Ort</dt>
        <dd>{locationText(item)}</dd>
        <dt>Eingefroren am</dt>
        <dd>
          <span>{formatDate(item.frozen_at)}</span> ({formatAge(item.frozen_at, today)})
        </dd>
        <dt>Haltbar bis</dt>
        <dd>{formatDate(expiryDate(item.frozen_at, item.category.max_months))}</dd>
        <dt>Kurzcode</dt>
        <dd className="code">{item.short_code}</dd>
      </dl>
      <div className="row actions">
        <Link className="button secondary" to={`/item/${item.id}/edit`}>
          Bearbeiten
        </Link>
        <button
          type="button"
          className="secondary"
          disabled={!canPrint(printer.state) || printing}
          onClick={async () => {
            setPrinting(true);
            setPrintError('');
            try {
              await printer.print(item);
            } catch (e) {
              setPrintError(printerErrorMessage(e));
            } finally {
              setPrinting(false);
            }
          }}
        >
          {printing ? 'Druckt …' : 'Label drucken'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            const media = printer.state.status === 'ready' || printer.state.status === 'printing' ? printer.state.media : null;
            void printOnPaper(item, media ?? PAPER_FALLBACK_SIZE);
          }}
        >
          Auf Papier drucken
        </button>
      </div>
      <PrinterHint state={printer.state} />
      {printError && <p className="error">{printError}</p>}
      <TakeCard item={item} showSummary={false} onDone={() => navigate('/')} />
    </>
  );
}
