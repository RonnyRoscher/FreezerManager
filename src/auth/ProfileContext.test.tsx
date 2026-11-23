import { act, screen } from '@testing-library/react';
import { renderApp, seededRepository } from '../test/renderApp';
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

afterEach(() => {
  vi.useRealTimers();
});

test('a failed background refresh keeps the current page and profile', async () => {
  const repo = seededRepository({ profile: profile(), households: [own, mueller] });
  renderApp('#/', repo);
  const search = await screen.findByRole('searchbox');
  vi.spyOn(repo, 'getProfile').mockRejectedValue(new Error('offline'));
  document.dispatchEvent(new Event('visibilitychange'));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(screen.queryByText('Profil konnte nicht geladen werden.')).not.toBeInTheDocument();
  expect(screen.getByRole('searchbox')).toBe(search);
  expect(screen.getByText('Unser Haushalt')).toBeInTheDocument();
});

test('a background refresh returning null keeps the loaded profile', async () => {
  const repo = seededRepository({ profile: profile() });
  renderApp('#/', repo);
  const search = await screen.findByRole('searchbox');
  vi.spyOn(repo, 'getProfile').mockResolvedValue(null);
  document.dispatchEvent(new Event('visibilitychange'));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(screen.getByRole('searchbox')).toBe(search);
});

test('admin profile is re-read every 30 s without a focus event, timer cleared on unmount', async () => {
  const repo = seededRepository({ profile: profile(), households: [own, mueller] });
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const r2 = renderApp('#/', repo);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(await screen.findByText('Unser Haushalt')).toBeInTheDocument();
  await repo.setActiveHousehold('h-m');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(await screen.findByText('Haushalt: Müller')).toBeInTheDocument();
  const spy = vi.spyOn(repo, 'getProfile');
  r2.unmount();
  await vi.advanceTimersByTimeAsync(90_000);
  expect(spy).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
