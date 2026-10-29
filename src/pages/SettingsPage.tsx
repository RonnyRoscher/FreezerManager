import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useRepository } from '../data/RepositoryContext';
import type { Category, FreezerWithCompartments } from '../domain/types';
import { errorMessage, LOAD_FAILED } from '../lib/messages';
import { loadLabelSize, saveLabelSize } from '../print/labelSettings';

type Message = { text: string; error: boolean } | null;

type RowProps = {
  label: string;
  name: string;
  months?: number;
  onSave: (name: string, months?: number) => void;
  onMove?: (direction: -1 | 1) => void;
  onDelete: () => void;
};

function EditableRow({ label, name, months, onSave, onMove, onDelete }: RowProps) {
  const [value, setValue] = useState(name);
  const [monthsValue, setMonthsValue] = useState(months ?? 0);
  return (
    <div className="row edit-row">
      <input aria-label={label} value={value} onChange={(e) => setValue(e.target.value)} />
      {months !== undefined && (
        <input
          type="number"
          min={1}
          className="months"
          aria-label={`Haltbarkeit ${name} (Monate)`}
          value={monthsValue}
          onChange={(e) => setMonthsValue(Number(e.target.value))}
        />
      )}
      <button
        type="button"
        className="secondary"
        aria-label={`${name} speichern`}
        disabled={!value.trim() || (months !== undefined && monthsValue < 1)}
        onClick={() => onSave(value.trim(), months !== undefined ? monthsValue : undefined)}
      >
        ✓
      </button>
      {onMove && (
        <>
          <button type="button" className="secondary" aria-label={`${name} nach oben`} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button type="button" className="secondary" aria-label={`${name} nach unten`} onClick={() => onMove(1)}>
            ↓
          </button>
        </>
      )}
      <button type="button" className="danger" aria-label={`${name} löschen`} onClick={onDelete}>
        ✕
      </button>
    </div>
  );
}

function AddForm({
  label,
  buttonLabel,
  onAdd,
  children,
}: {
  label: string;
  buttonLabel: string;
  onAdd: (name: string) => Promise<boolean>;
  children?: ReactNode;
}) {
  const [value, setValue] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    if (await onAdd(value.trim())) setValue('');
  }
  return (
    <form className="row add-row" onSubmit={submit}>
      <input aria-label={label} placeholder={label} value={value} onChange={(e) => setValue(e.target.value)} />
      {children}
      <button type="submit" aria-label={buttonLabel} disabled={!value.trim()}>
        +
      </button>
    </form>
  );
}

/** Moves the element at `index` by `direction` and returns the new order. */
function moved<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function SettingsPage() {
  const repo = useRepository();
  const [freezers, setFreezers] = useState<FreezerWithCompartments[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [message, setMessage] = useState<Message>(null);
  const [newMonths, setNewMonths] = useState(6);
  const [labelSize, setLabelSize] = useState(loadLabelSize);

  const reload = useCallback(async () => {
    try {
      const [f, c] = await Promise.all([repo.listFreezers(), repo.listCategories()]);
      setFreezers(f);
      setCategories(c);
    } catch {
      setMessage({ text: LOAD_FAILED, error: true });
    }
  }, [repo]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function run(action: () => Promise<unknown>, success = 'Gespeichert'): Promise<boolean> {
    try {
      await action();
      setMessage({ text: success, error: false });
      return true;
    } catch (e) {
      setMessage({ text: errorMessage(e), error: true });
      return false;
    } finally {
      await reload();
    }
  }

  function reorder<T extends { id: string; sort_order: number }>(
    list: T[],
    index: number,
    direction: -1 | 1,
    save: (item: T) => Promise<unknown>,
  ) {
    const next = moved(list, index, direction);
    run(() =>
      Promise.all(next.map((item, i) => (item.sort_order === i ? null : save({ ...item, sort_order: i })))),
    );
  }

  function saveSize(e: FormEvent) {
    e.preventDefault();
    saveLabelSize(labelSize);
    setMessage({ text: 'Gespeichert', error: false });
  }

  return (
    <div className="settings">
      <h1>Einstellungen</h1>
      {message && <p className={message.error ? 'error' : 'notice'}>{message.text}</p>}

      <section aria-labelledby="freezers-heading">
        <h2 id="freezers-heading">Gefriergeräte</h2>
        {freezers.map((freezer, index) => (
          <div className="card freezer-card" key={freezer.id}>
            <EditableRow
              key={`${freezer.id}-${freezer.name}`}
              label={`Gerät ${freezer.name}`}
              name={freezer.name}
              onSave={(name) =>
                run(() => repo.saveFreezer({ id: freezer.id, name, sort_order: freezer.sort_order }))
              }
              onMove={(d) =>
                reorder(freezers, index, d, ({ id, name, sort_order }) =>
                  repo.saveFreezer({ id, name, sort_order }),
                )
              }
              onDelete={() => run(() => repo.deleteFreezer(freezer.id), 'Gelöscht')}
            />
            <div className="compartments">
              {freezer.compartments.map((c, cIndex) => (
                <EditableRow
                  key={`${c.id}-${c.name}`}
                  label={`Fach ${c.name}`}
                  name={c.name}
                  onSave={(name) => run(() => repo.saveCompartment({ ...c, name }))}
                  onMove={(d) => reorder(freezer.compartments, cIndex, d, (x) => repo.saveCompartment(x))}
                  onDelete={() => run(() => repo.deleteCompartment(c.id), 'Gelöscht')}
                />
              ))}
              <AddForm
                label={`Neues Fach in ${freezer.name}`}
                buttonLabel={`Fach zu ${freezer.name} hinzufügen`}
                onAdd={(name) =>
                  run(() =>
                    repo.saveCompartment({
                      freezer_id: freezer.id,
                      name,
                      sort_order: freezer.compartments.length,
                    }),
                  )
                }
              />
            </div>
          </div>
        ))}
        <AddForm
          label="Neues Gerät"
          buttonLabel="Gerät hinzufügen"
          onAdd={(name) => run(() => repo.saveFreezer({ name, sort_order: freezers.length }))}
        />
      </section>

      <section aria-labelledby="categories-heading">
        <h2 id="categories-heading">Kategorien</h2>
        <p className="hint">Haltbarkeit in Monaten – danach wird ein Eintrag rot markiert.</p>
        <div className="card">
          {categories.map((c) => (
            <EditableRow
              key={`${c.id}-${c.name}-${c.max_months}`}
              label={`Kategorie ${c.name}`}
              name={c.name}
              months={c.max_months}
              onSave={(name, months) => run(() => repo.saveCategory({ id: c.id, name, max_months: months! }))}
              onDelete={() => run(() => repo.deleteCategory(c.id), 'Gelöscht')}
            />
          ))}
          <AddForm
            label="Neue Kategorie"
            buttonLabel="Kategorie hinzufügen"
            onAdd={(name) => run(() => repo.saveCategory({ name, max_months: newMonths }))}
          >
            <input
              type="number"
              min={1}
              className="months"
              aria-label="Haltbarkeit neue Kategorie (Monate)"
              value={newMonths}
              onChange={(e) => setNewMonths(Number(e.target.value))}
            />
          </AddForm>
        </div>
      </section>

      <section aria-labelledby="label-heading">
        <h2 id="label-heading">Label</h2>
        <form className="card row" onSubmit={saveSize}>
          <label>
            Breite (mm)
            <input
              type="number"
              min={10}
              value={labelSize.widthMm}
              onChange={(e) => setLabelSize({ ...labelSize, widthMm: Number(e.target.value) })}
            />
          </label>
          <label>
            Höhe (mm)
            <input
              type="number"
              min={10}
              value={labelSize.heightMm}
              onChange={(e) => setLabelSize({ ...labelSize, heightMm: Number(e.target.value) })}
            />
          </label>
          <button type="submit">Labelgröße speichern</button>
        </form>
      </section>
    </div>
  );
}
