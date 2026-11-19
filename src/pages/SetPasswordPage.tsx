import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useRepository } from '../data/RepositoryContext';

const MIN_LENGTH = 8;

export function SetPasswordPage() {
  const repo = useRepository();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < MIN_LENGTH) {
      setError(`Das Passwort muss mindestens ${MIN_LENGTH} Zeichen haben.`);
      return;
    }
    if (password !== repeat) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }
    setBusy(true);
    try {
      await repo.updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(`Speichern fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <h1>Neues Passwort</h1>
        <p className="notice">Passwort gespeichert.</p>
        <Link to="/">Zur Übersicht</Link>
      </>
    );
  }

  return (
    <>
      <h1>Neues Passwort</h1>
      <form className="card form" onSubmit={submit} noValidate>
        <label>
          Neues Passwort
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          Passwort wiederholen
          <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          Passwort speichern
        </button>
      </form>
    </>
  );
}
