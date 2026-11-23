import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useProfile } from '../auth/ProfileContext';
import { useRepository } from '../data/RepositoryContext';
import type { HouseholdSummary, ProfileSummary } from '../domain/types';
import { LOAD_FAILED, SAVE_FAILED } from '../lib/messages';

type Message = { text: string; error: boolean } | null;

const dbMessage = (e: unknown) => (e instanceof Error && e.message ? e.message : SAVE_FAILED);

function HouseholdRow({
  household,
  own,
  onRename,
  onOpen,
  onDelete,
}: {
  household: HouseholdSummary;
  own: boolean;
  onRename: (name: string) => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [value, setValue] = useState(household.name);
  const members = `${household.memberCount} ${household.memberCount === 1 ? 'Mitglied' : 'Mitglieder'}`;
  return (
    <div className="household-row">
      <div className="row edit-row">
        <input aria-label={`Haushalt ${household.name}`} value={value} onChange={(e) => setValue(e.target.value)} />
        <button
          type="button"
          className="secondary"
          aria-label={`${household.name} speichern`}
          disabled={!value.trim()}
          onClick={() => onRename(value.trim())}
        >
          ✓
        </button>
      </div>
      <div className="row household-meta">
        <span>{members}</span>
        {own && <span className="badge">eigener</span>}
        <button type="button" className="secondary" aria-label={`${household.name} öffnen`} onClick={onOpen}>
          Öffnen
        </button>
        <button type="button" className="danger" aria-label={`${household.name} löschen`} onClick={onDelete}>
          Löschen
        </button>
      </div>
    </div>
  );
}

export function AdminPage() {
  const repo = useRepository();
  const { profile, reload: reloadProfile, switchHousehold } = useProfile();
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [message, setMessage] = useState<Message>(null);
  const [newName, setNewName] = useState('');

  const reload = useCallback(async () => {
    try {
      const [h, p] = await Promise.all([repo.listHouseholds(), repo.listProfiles()]);
      setHouseholds(h);
      setProfiles(p);
    } catch (e) {
      setMessage({ text: e instanceof Error && e.message ? e.message : LOAD_FAILED, error: true });
    }
  }, [repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(action: () => Promise<unknown>, success = 'Gespeichert', refreshProfile = false) {
    let ok = false;
    try {
      await action();
      setMessage({ text: success, error: false });
      ok = true;
    } catch (e) {
      setMessage({ text: dbMessage(e), error: true });
    }
    await reload();
    if (refreshProfile) await reloadProfile();
    return ok;
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    if (await run(() => repo.createHousehold(newName.trim()), 'Angelegt')) setNewName('');
  }

  async function open(id: string) {
    try {
      await switchHousehold(id);
    } catch (e) {
      setMessage({ text: dbMessage(e), error: true });
    }
  }

  return (
    <div className="admin">
      <h1>Verwaltung</h1>
      {message && <p className={message.error ? 'error' : 'notice'}>{message.text}</p>}

      <section aria-labelledby="households-heading">
        <h2 id="households-heading">Haushalte</h2>
        <div className="card">
          {households.map((h) => (
            <HouseholdRow
              key={`${h.id}-${h.name}`}
              household={h}
              own={h.id === profile?.household?.id}
              onRename={(name) => run(() => repo.renameHousehold(h.id, name), 'Gespeichert', true)}
              onOpen={() => void open(h.id)}
              onDelete={() =>
                run(() => repo.deleteHousehold(h.id), 'Gelöscht', h.id === profile?.activeHousehold?.id)
              }
            />
          ))}
          <form className="row add-row" onSubmit={create}>
            <input
              aria-label="Neuer Haushalt"
              placeholder="Neuer Haushalt"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" disabled={!newName.trim()}>
              Anlegen
            </button>
          </form>
        </div>
      </section>

      <section aria-labelledby="users-heading">
        <h2 id="users-heading">Benutzer</h2>
        <p className="hint">Neue Konten im Supabase-Dashboard unter Authentication › Add user anlegen.</p>
        <div className="card">
          {profiles.map((p) => (
            <div className="row user-row" key={p.userId}>
              <span className="user-email">
                {p.email}
                {p.isAdmin && <span className="badge">Admin</span>}
              </span>
              <select
                aria-label={`Haushalt von ${p.email}`}
                value={p.householdId ?? ''}
                onChange={(e) =>
                  run(
                    () => repo.setMemberHousehold(p.userId, e.target.value || null),
                    'Gespeichert',
                    p.userId === profile?.userId,
                  )
                }
              >
                <option value="">– keiner –</option>
                {households.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
