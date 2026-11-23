import { useRepository } from '../data/RepositoryContext';

export function NoHouseholdPage() {
  const repo = useRepository();
  return (
    <main className="page login">
      <p>Dein Konto ist noch keinem Haushalt zugeordnet. Bitte wende dich an den Admin.</p>
      <button type="button" className="link-button" onClick={() => repo.signOut()}>
        Abmelden
      </button>
    </main>
  );
}
