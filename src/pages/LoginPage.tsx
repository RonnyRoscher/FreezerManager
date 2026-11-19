import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, type Location } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { loginErrorMessage } from '../auth/authRedirect';
import { useRepository } from '../data/RepositoryContext';

export function LoginPage({ authMessage }: { authMessage?: string }) {
  const repo = useRepository();
  const { session } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(authMessage ?? '');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: Location } | null)?.from;
  if (session) return <Navigate to={from ? from.pathname + from.search : '/'} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await repo.signIn(email, password);
    } catch (e) {
      setError(loginErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    setError('');
    setNotice('');
    if (!email.trim()) {
      setError('Bitte zuerst die E-Mail-Adresse eingeben.');
      return;
    }
    setBusy(true);
    try {
      await repo.sendPasswordReset(email.trim());
      setNotice('Falls die Adresse bekannt ist, wurde ein Link zum Zurücksetzen gesendet.');
    } catch (e) {
      setError(`Senden fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page login">
      <h1>FreezerManager</h1>
      <form onSubmit={submit} className="card form">
        <label>
          E-Mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label>
          Passwort
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        <button type="submit" disabled={busy}>Anmelden</button>
        <button type="button" className="link-button" disabled={busy} onClick={forgotPassword}>
          Passwort vergessen?
        </button>
      </form>
    </main>
  );
}
