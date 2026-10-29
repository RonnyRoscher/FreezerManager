import { useCallback, useEffect, useMemo, useState } from 'react';
import { ItemRow } from '../components/ItemRow';
import { useRepository } from '../data/RepositoryContext';
import { todayIso } from '../domain/dates';
import { filterItems, groupByCategory, sortByAge } from '../domain/overview';
import type { Freezer, ItemView } from '../domain/types';
import { LOAD_FAILED } from '../lib/messages';

type Mode = 'category' | 'age';
const MODE_KEY = 'fm.overviewMode';

function loadMode(): Mode {
  return localStorage.getItem(MODE_KEY) === 'age' ? 'age' : 'category';
}

export function OverviewPage() {
  const repo = useRepository();
  const [items, setItems] = useState<ItemView[] | null>(null);
  const [freezers, setFreezers] = useState<Freezer[]>([]);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<Mode>(loadMode);
  const [freezerId, setFreezerId] = useState('');
  const [query, setQuery] = useState('');
  const today = todayIso();

  const load = useCallback(async () => {
    try {
      const [i, f] = await Promise.all([repo.listItems(), repo.listFreezers()]);
      setItems(i);
      setFreezers(f);
      setError(false);
    } catch {
      setError(true);
    }
  }, [repo]);

  useEffect(() => {
    load();
    return repo.subscribeItems(load);
  }, [repo, load]);

  const visible = useMemo(
    () => filterItems(items ?? [], { freezerId: freezerId || undefined, query }),
    [items, freezerId, query],
  );

  function chooseMode(next: Mode) {
    setMode(next);
    localStorage.setItem(MODE_KEY, next);
  }

  return (
    <>
      <h1>Übersicht</h1>
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Ansicht">
          <button type="button" aria-pressed={mode === 'category'} onClick={() => chooseMode('category')}>
            nach Kategorie
          </button>
          <button type="button" aria-pressed={mode === 'age'} onClick={() => chooseMode('age')}>
            nach Alter
          </button>
        </div>
        <label>
          Gerät
          <select value={freezerId} onChange={(e) => setFreezerId(e.target.value)}>
            <option value="">Alle Geräte</option>
            {freezers.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Suche
          <input type="search" value={query} placeholder="Name, Details, Code" onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      {error && (
        <div className="error-box">
          <p className="error">{LOAD_FAILED}</p>
          <button type="button" onClick={load}>
            Erneut versuchen
          </button>
        </div>
      )}
      {!error && items === null && <p className="status">Laden …</p>}
      {!error && items?.length === 0 && <p className="status">Noch nichts eingefroren.</p>}
      {!error && items && items.length > 0 && visible.length === 0 && (
        <p className="status">Keine Treffer.</p>
      )}

      {mode === 'age' ? (
        <div className="item-list">
          {sortByAge(visible).map((item) => (
            <ItemRow key={item.id} item={item} today={today} />
          ))}
        </div>
      ) : (
        groupByCategory(visible).map(({ category, items: group }) => (
          <section key={category.id} aria-label={category.name}>
            <h2>
              {category.name} <span className="count">{group.length}</span>
            </h2>
            <div className="item-list">
              {group.map((item) => (
                <ItemRow key={item.id} item={item} today={today} />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
