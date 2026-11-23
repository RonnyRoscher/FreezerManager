import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Profile } from '../domain/types';
import { renderApp, seededRepository } from '../test/renderApp';

const own = { id: 'h-own', name: 'Unser Haushalt' };
const profile = (over: Partial<Profile> = {}): Profile => ({
  userId: 'u1',
  email: 'ich@example.de',
  isAdmin: true,
  household: own,
  activeHousehold: own,
  ...over,
});
const summaries = [
  { userId: 'u1', email: 'ich@example.de', isAdmin: true, householdId: own.id },
  { userId: 'u2', email: 'oma@example.de', isAdmin: false, householdId: null },
];
const setup = (over = {}) =>
  renderApp(
    '#/admin',
    seededRepository({ profile: profile(), households: [own], profiles: summaries, ...over }),
  );
const householdRow = async (name: string) =>
  (await screen.findByLabelText(`Haushalt ${name}`)).closest('.household-row') as HTMLElement;

test('creates a household with 0 members', async () => {
  setup();
  await userEvent.type(await screen.findByLabelText('Neuer Haushalt'), 'Müller');
  await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));
  const row = await householdRow('Müller');
  expect(within(row).getByText('0 Mitglieder')).toBeInTheDocument();
  expect(within(await householdRow('Unser Haushalt')).getByText('1 Mitglied')).toBeInTheDocument();
  expect(screen.getByText('eigener')).toBeInTheDocument();
  expect(screen.getByText('Neue Konten im Supabase-Dashboard unter Authentication › Add user anlegen.')).toBeInTheDocument();
});

test('renames a household', async () => {
  setup();
  const input = await screen.findByLabelText('Haushalt Unser Haushalt');
  await userEvent.clear(input);
  await userEvent.type(input, 'Zuhause');
  await userEvent.click(screen.getByRole('button', { name: 'Unser Haushalt speichern' }));
  expect(await screen.findByLabelText('Haushalt Zuhause')).toBeInTheDocument();
});

test('shows the database message when deleting a household with members', async () => {
  setup();
  await userEvent.click(await screen.findByRole('button', { name: 'Unser Haushalt löschen' }));
  expect(await screen.findByText('Haushalt kann nicht gelöscht werden: noch Mitglieder')).toBeInTheDocument();
});

test('assigns a user to a household', async () => {
  const { repo } = setup({ households: [own, { id: 'h-m', name: 'Müller' }] });
  const select = await screen.findByLabelText('Haushalt von oma@example.de');
  expect(within(select).getByRole('option', { name: '– keiner –' })).toBeInTheDocument();
  await userEvent.selectOptions(select, 'Müller');
  await waitFor(async () =>
    expect((await repo.listProfiles()).find((p) => p.userId === 'u2')?.householdId).toBe('h-m'),
  );
  expect(within(await householdRow('Müller')).getByText('1 Mitglied')).toBeInTheDocument();
});

test('opens a household and shows the banner with an empty overview', async () => {
  setup({ households: [own, { id: 'h-m', name: 'Müller' }] });
  await userEvent.click(await screen.findByRole('button', { name: 'Müller öffnen' }));
  expect(await screen.findByText('Haushalt: Müller')).toBeInTheDocument();
  await waitFor(() => expect(window.location.hash).toBe('#/'));
  expect(screen.queryByText('Hackfleisch')).not.toBeInTheDocument();
});

test('deleting the open household returns to the own household', async () => {
  setup({ households: [own, { id: 'h-m', name: 'Müller' }] });
  await userEvent.click(await screen.findByRole('button', { name: 'Müller öffnen' }));
  await screen.findByText('Haushalt: Müller');
  window.location.hash = '#/admin';
  await userEvent.click(await screen.findByRole('button', { name: 'Müller löschen' }));
  await waitFor(() => expect(screen.queryByText('Haushalt: Müller')).not.toBeInTheDocument());
  expect(screen.queryByText(/Zurück zu meinem Haushalt/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Haushalt Müller')).not.toBeInTheDocument();
});

test('a member visiting #/admin lands on the overview', async () => {
  renderApp('#/admin', seededRepository({ profile: profile({ isAdmin: false }) }));
  await screen.findByRole('link', { name: /Übersicht/ });
  await waitFor(() => expect(window.location.hash).toBe('#/'));
  expect(screen.queryByRole('heading', { name: 'Verwaltung' })).not.toBeInTheDocument();
});

test('an admin without own household can still reach the admin page', async () => {
  renderApp(
    '#/admin',
    seededRepository({
      profile: profile({ household: null, activeHousehold: null }),
      households: [own],
      profiles: [{ ...summaries[0], householdId: null }],
    }),
  );
  expect(await screen.findByRole('heading', { name: 'Verwaltung' })).toBeInTheDocument();
  expect(screen.queryByText(/noch keinem Haushalt/)).not.toBeInTheDocument();
});

test('assigning the own account refreshes the profile', async () => {
  renderApp(
    '#/admin',
    seededRepository({
      profile: profile({ household: null, activeHousehold: null }),
      households: [own],
      profiles: [{ ...summaries[0], householdId: null }],
    }),
  );
  await userEvent.selectOptions(await screen.findByLabelText('Haushalt von ich@example.de'), 'Unser Haushalt');
  expect(await screen.findByText('Unser Haushalt', { selector: '.household-name' })).toBeInTheDocument();
});
