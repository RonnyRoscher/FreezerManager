import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, type Location } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useRepository } from '../data/RepositoryContext';

export function LoginPage() {
  const repo = useRepository();
  const { session } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: Location } | null)?.from;
  if (session) return <Navigate to={from ? from.pathname + from.search : '/'} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await repo.signIn(email, password);
    } catch {
      setError('Anmeldung fehlgeschlagen');
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
        <button type="submit" disabled={busy}>Anmelden</button>
      </form>
    </main>
  );
}
