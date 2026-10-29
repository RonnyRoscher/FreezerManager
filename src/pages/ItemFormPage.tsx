import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRepository } from '../data/RepositoryContext';
import { todayIso } from '../domain/dates';
import type { Category, FreezerWithCompartments, ItemInput } from '../domain/types';
import { loadFormPrefs, saveFormPrefs } from '../lib/formPrefs';
import { LOAD_FAILED, NOT_IN_STOCK, SAVE_FAILED } from '../lib/messages';
import { printLabel } from '../print/printLabel';

type Fields = {
  name: string;
  details: string;
  quantity: string;
  categoryId: string;
  freezerId: string;
  compartmentId: string;
  frozenAt: string;
};

const emptyItemFields = { name: '', details: '', quantity: '' };

function validate(f: Fields): string | null {
  if (!f.name.trim()) return 'Bitte Namen angeben';
  if (!f.categoryId) return 'Bitte Kategorie wählen';
  if (!f.freezerId || !f.compartmentId) return 'Bitte Gerät und Fach wählen';
  if (!f.frozenAt) return 'Bitte Datum angeben';
  return null;
}

function toInput(f: Fields): ItemInput {
  return {
    name: f.name.trim(),
    details: f.details.trim() || null,
    quantity: f.quantity.trim() || null,
    category_id: f.categoryId,
    compartment_id: f.compartmentId,
    frozen_at: f.frozenAt,
  };
}

/** Restores remembered selections, dropping any that no longer exist. */
function initialSelection(freezers: FreezerWithCompartments[], categories: Category[]) {
  const prefs = loadFormPrefs();
  const freezer = freezers.find((f) => f.id === prefs.freezerId);
  return {
    categoryId: categories.some((c) => c.id === prefs.categoryId) ? prefs.categoryId! : '',
    freezerId: freezer?.id ?? '',
    compartmentId: freezer?.compartments.some((c) => c.id === prefs.compartmentId)
      ? prefs.compartmentId!
      : '',
  };
}

export function ItemFormPage() {
  const repo = useRepository();
  const navigate = useNavigate();
  const { id } = useParams();
  const editing = Boolean(id);

  const [freezers, setFreezers] = useState<FreezerWithCompartments[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [fields, setFields] = useState<Fields | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [f, c, n, item] = await Promise.all([
          repo.listFreezers(),
          repo.listCategories(),
          repo.listItemNames(),
          id ? repo.getItem(id) : Promise.resolve(null),
        ]);
        if (!active) return;
        setFreezers(f);
        setCategories(c);
        setNames(n);
        if (id && !item) {
          setError(NOT_IN_STOCK);
          return;
        }
        setFields(
          item
            ? {
                name: item.name,
                details: item.details ?? '',
                quantity: item.quantity ?? '',
                categoryId: item.category_id,
                freezerId: item.freezer.id,
                compartmentId: item.compartment_id,
                frozenAt: item.frozen_at,
              }
            : { ...emptyItemFields, ...initialSelection(f, c), frozenAt: todayIso() },
        );
      } catch {
        if (active) setError(LOAD_FAILED);
      }
    })();
    return () => {
      active = false;
    };
  }, [repo, id]);

  if (!fields) {
    return (
      <>
        <h1>{editing ? 'Bearbeiten' : 'Einfrieren'}</h1>
        {error ? <p className="error">{error}</p> : <p className="status">Laden …</p>}
      </>
    );
  }

  const set = (patch: Partial<Fields>) => setFields({ ...fields, ...patch });
  const compartments = freezers.find((f) => f.id === fields.freezerId)?.compartments ?? [];

  async function save(print: boolean) {
    const current = fields!;
    const problem = validate(current);
    setNotice('');
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setBusy(true);
    try {
      const saved = id
        ? await repo.updateItem(id, toInput(current))
        : await repo.createItem(toInput(current));
      saveFormPrefs({
        categoryId: current.categoryId,
        freezerId: current.freezerId,
        compartmentId: current.compartmentId,
      });
      if (print) {
        const view = await repo.getItem(saved.id);
        if (view) await printLabel(view);
      }
      if (id) {
        navigate(`/item/${id}`);
        return;
      }
      setNotice(`Gespeichert: ${saved.name} (${saved.short_code})`);
      setFields({ ...current, ...emptyItemFields });
      if (!names.includes(saved.name)) setNames([...names, saved.name].sort((a, b) => a.localeCompare(b, 'de')));
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    save(false);
  }

  return (
    <>
      <h1>{editing ? 'Bearbeiten' : 'Einfrieren'}</h1>
      {notice && <p className="notice">{notice}</p>}
      <form className="card form" onSubmit={submit} noValidate>
        <label>
          Name
          <input
            value={fields.name}
            list="name-suggestions"
            autoComplete="off"
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <datalist id="name-suggestions">
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </datalist>
        <label>
          Details
          <input value={fields.details} onChange={(e) => set({ details: e.target.value })} />
        </label>
        <label>
          Menge
          <input
            value={fields.quantity}
            placeholder="z. B. 500 g, 2 Portionen"
            onChange={(e) => set({ quantity: e.target.value })}
          />
        </label>
        <label>
          Kategorie
          <select value={fields.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
            <option value="">Bitte wählen</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="row two-cols">
          <label>
            Gerät
            <select
              value={fields.freezerId}
              onChange={(e) => {
                const freezer = freezers.find((f) => f.id === e.target.value);
                set({
                  freezerId: e.target.value,
                  compartmentId: freezer?.compartments.length === 1 ? freezer.compartments[0].id : '',
                });
              }}
            >
              <option value="">Bitte wählen</option>
              {freezers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fach
            <select value={fields.compartmentId} onChange={(e) => set({ compartmentId: e.target.value })}>
              <option value="">Bitte wählen</option>
              {compartments.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Eingefroren am
          <input type="date" value={fields.frozenAt} onChange={(e) => set({ frozenAt: e.target.value })} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit" disabled={busy}>
            Speichern
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => save(true)}>
            Speichern & Label drucken
          </button>
        </div>
      </form>
    </>
  );
}
