import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, seededRepository } from '../test/renderApp';
import { makeItem } from '../test/fixtures';
import type { Profile } from '../domain/types';

const own = { id: 'h-own', name: 'Unser Haushalt' };
const mueller = { id: 'h-m', name: 'Müller' };
const profile = (over: Partial<Profile> = {}): Profile => ({
  userId: 'u1',
  email: 'ich@example.de',
  isAdmin: true,
  household: own,
  activeHousehold: own,
  ...over,
});

test('account without household sees only the hint and logout', async () => {
  renderApp('#/', seededRepository({ profile: profile({ household: null, activeHousehold: null }) }));
  expect(
    await screen.findByText('Dein Konto ist noch keinem Haushalt zugeordnet. Bitte wende dich an den Admin.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Abmelden' })).toBeInTheDocument();
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});

test('only admins see the Verwaltung link', async () => {
  const { unmount } = renderApp('#/', seededRepository({ profile: profile() }));
  expect(await screen.findByRole('link', { name: /Verwaltung/ })).toHaveAttribute('href', '#/admin');
  unmount();
  renderApp('#/', seededRepository({ profile: profile({ isAdmin: false }) }));
  await screen.findByRole('link', { name: /Übersicht/ });
  expect(screen.queryByRole('link', { name: /Verwaltung/ })).not.toBeInTheDocument();
});

test('banner for a foreign household and way back', async () => {
  const repo = seededRepository({
    profile: profile({ activeHousehold: mueller }),
    households: [own, mueller],
    items: [makeItem({ name: 'Hackfleisch' })],
  });
  const spy = vi.spyOn(repo, 'setActiveHousehold');
  renderApp('#/', repo);
  expect(await screen.findByText('Haushalt: Müller')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Zurück zu meinem Haushalt' }));
  expect(spy).toHaveBeenCalledWith(null);
  await waitFor(() => expect(screen.queryByText('Haushalt: Müller')).not.toBeInTheDocument());
  expect(await screen.findByText('Hackfleisch')).toBeInTheDocument();
});

test('reloads the profile when the page becomes visible again', async () => {
  const repo = seededRepository({ profile: profile(), households: [own, mueller] });
  renderApp('#/', repo);
  expect(await screen.findByText('Unser Haushalt')).toBeInTheDocument();
  await repo.setActiveHousehold('h-m');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(await screen.findByText('Haushalt: Müller')).toBeInTheDocument();
});
