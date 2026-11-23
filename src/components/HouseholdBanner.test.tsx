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

test('a failing profile load offers a retry instead of the no-household hint', async () => {
  const repo = seededRepository({ profile: profile() });
  const real = repo.getProfile.bind(repo);
  const spy = vi.spyOn(repo, 'getProfile').mockRejectedValueOnce(new Error('offline'));
  renderApp('#/', repo);
  expect(await screen.findByText('Profil konnte nicht geladen werden.')).toBeInTheDocument();
  expect(screen.queryByText(/noch keinem Haushalt/)).not.toBeInTheDocument();
  spy.mockImplementation(real);
  await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
  expect(await screen.findByText('Unser Haushalt')).toBeInTheDocument();
});

test('a failing household switch shows a message and keeps the app usable', async () => {
  const repo = seededRepository({ profile: profile({ activeHousehold: mueller }), households: [own, mueller] });
  vi.spyOn(repo, 'setActiveHousehold').mockRejectedValueOnce(new Error('boom'));
  renderApp('#/', repo);
  await userEvent.click(await screen.findByRole('button', { name: 'Zurück zu meinem Haushalt' }));
  expect(await screen.findByText('Wechsel fehlgeschlagen. Bitte erneut versuchen.')).toBeInTheDocument();
  expect(screen.getByText('Haushalt: Müller')).toBeInTheDocument();
});

test('an older profile response never overwrites a newer one', async () => {
  const repo = seededRepository({ profile: profile(), households: [own, mueller] });
  const real = repo.getProfile.bind(repo);
  renderApp('#/', repo);
  expect(await screen.findByText('Unser Haushalt')).toBeInTheDocument();
  let resolveOld!: (p: Profile | null) => void;
  const old = new Promise<Profile | null>((r) => (resolveOld = r));
  const oldSnapshot = await real();
  vi.spyOn(repo, 'getProfile').mockImplementationOnce(() => old).mockImplementation(real);
  document.dispatchEvent(new Event('visibilitychange')); // slow, old
  await repo.setActiveHousehold('h-m');
  document.dispatchEvent(new Event('visibilitychange')); // fast, new
  expect(await screen.findByText('Haushalt: Müller')).toBeInTheDocument();
  resolveOld({ ...oldSnapshot!, activeHousehold: own });
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.getByText('Haushalt: Müller')).toBeInTheDocument();
});

test('switching back navigates to the overview', async () => {
  const repo = seededRepository({ profile: profile({ activeHousehold: mueller }), households: [own, mueller] });
  renderApp('#/settings', repo);
  await userEvent.click(await screen.findByRole('button', { name: 'Zurück zu meinem Haushalt' }));
  await waitFor(() => expect(window.location.hash).toBe('#/'));
});

test('page state is reset when the active household changes', async () => {
  const repo = seededRepository({ profile: profile(), households: [own, mueller] });
  renderApp('#/', repo);
  const search = await screen.findByRole('searchbox');
  await userEvent.type(search, 'abc');
  expect(search).toHaveValue('abc');
  await repo.setActiveHousehold('h-m');
  document.dispatchEvent(new Event('visibilitychange'));
  await screen.findByText('Haushalt: Müller');
  expect(screen.getByRole('searchbox')).toHaveValue('');
});
