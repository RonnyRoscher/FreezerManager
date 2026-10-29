import { NavLink, Outlet } from 'react-router-dom';
import { useRepository } from '../data/RepositoryContext';

const links = [
  { to: '/', label: 'Übersicht', icon: '☰' },
  { to: '/scan', label: 'Scannen', icon: '⌁' },
  { to: '/new', label: 'Einfrieren', icon: '❄' },
  { to: '/settings', label: 'Einstellungen', icon: '⚙' },
];

export function Layout() {
  const repo = useRepository();
  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">FreezerManager</span>
        <nav className="nav">
          {links.map((l) => (
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
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
