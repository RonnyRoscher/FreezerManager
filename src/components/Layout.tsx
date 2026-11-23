import { NavLink, Outlet } from 'react-router-dom';
import { useProfile } from '../auth/ProfileContext';
import { useRepository } from '../data/RepositoryContext';
import { NoHouseholdPage } from '../pages/NoHouseholdPage';
import { HouseholdBanner } from './HouseholdBanner';

const links = [
  { to: '/', label: 'Übersicht', icon: '☰' },
  { to: '/scan', label: 'Scannen', icon: '⌁' },
  { to: '/new', label: 'Einfrieren', icon: '❄' },
  { to: '/settings', label: 'Einstellungen', icon: '⚙' },
];

export function Layout() {
  const repo = useRepository();
  const { profile, loading } = useProfile();
  if (loading) return <p className="status">Laden …</p>;
  if (!profile || !profile.activeHousehold) return <NoHouseholdPage />;
  const all = profile.isAdmin ? [...links, { to: '/admin', label: 'Verwaltung', icon: '⚑' }] : links;
  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">FreezerManager</span>
        <span className="household-name">{profile.activeHousehold.name}</span>
        <nav className="nav">
          {all.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'}>
              <span className="nav-icon" aria-hidden="true">{l.icon}</span>
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>
        <button type="button" className="link-button logout" onClick={() => repo.signOut()}>
          Abmelden
        </button>
      </header>
      <HouseholdBanner />
      <main className="page" key={profile.activeHousehold.id}>
        <Outlet />
      </main>
    </div>
  );
}
