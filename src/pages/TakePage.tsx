import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TakeCard } from '../components/TakeCard';
import { useRepository } from '../data/RepositoryContext';
import type { ItemView } from '../domain/types';
import { LOAD_FAILED, NOT_IN_STOCK } from '../lib/messages';

export function TakePage() {
  const repo = useRepository();
  const { id = '' } = useParams();
  const [item, setItem] = useState<ItemView | null | undefined>(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    repo
      .getItem(id)
      .then(setItem)
      .catch(() => setError(LOAD_FAILED));
  }, [repo, id]);

  return (
    <>
      <h1>Entnehmen</h1>
      {error && <p className="error">{error}</p>}
      {!error && item === undefined && <p className="status">Laden …</p>}
      {item === null && <div className="card">{NOT_IN_STOCK}</div>}
      {item && <TakeCard item={item} />}
      <p>
        <Link to="/">Zur Übersicht</Link>
      </p>
    </>
  );
}
