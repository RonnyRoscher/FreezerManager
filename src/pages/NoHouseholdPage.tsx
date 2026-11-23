import { useProfile } from '../auth/ProfileContext';
import { useRepository } from '../data/RepositoryContext';

export function NoHouseholdPage() {
  const repo = useRepository();
  const { profile } = useProfile();
  return (
    <main className="page login">
      <p>Dein Konto ist noch keinem Haushalt zugeordnet. Bitte wende dich an den Admin.</p>
      {profile?.isAdmin && <a href="#/admin">Zur Verwaltung</a>}
      <button type="button" className="link-button" onClick={() => repo.signOut()}>
        Abmelden
      </button>
    </main>
  );
}
