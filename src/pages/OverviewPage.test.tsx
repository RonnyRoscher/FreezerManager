import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, seededRepository } from '../test/renderApp';
import { drawer2, kitchen, meat, top, veg } from '../test/fixtures';
import { addMonths, todayIso } from '../domain/dates';
import type { ItemInput } from '../domain/types';

const monthsAgo = (n: number) => addMonths(todayIso(), -n);

const mince: ItemInput = {
  name: 'Hackfleisch', details: 'für Bolognese', quantity: '500 g',
  category_id: meat.id, compartment_id: drawer2.id, frozen_at: monthsAgo(4),
};
const oldSteak: ItemInput = {
  name: 'Steak', details: null, quantity: null,
  category_id: meat.id, compartment_id: drawer2.id, frozen_at: monthsAgo(7),
};
const peas: ItemInput = {
  name: 'Erbsen', details: null, quantity: null,
  category_id: veg.id, compartment_id: top.id, frozen_at: monthsAgo(1),
};

async function openOverview(items: ItemInput[] = [mince, oldSteak, peas]) {
  const repo = seededRepository();
  for (const item of items) await repo.createItem(item);
  renderApp('#/', repo);
  await screen.findByRole('heading', { name: 'Übersicht' });
  return repo;
}

const rowNames = () => screen.getAllByRole('link', { name: /vor / }).map((a) => a.querySelector('.item-name')!.textContent);

test('groups by category by default, oldest first within a group', async () => {
  await openOverview();
  const meatGroup = await screen.findByRole('region', { name: 'Fleisch' });
  expect(within(meatGroup).getAllByRole('link').map((a) => a.querySelector('.item-name')!.textContent))
    .toEqual(['Steak', 'Hackfleisch']);
  expect(screen.getByRole('region', { name: 'Gemüse' })).toBeInTheDocument();
});

test('switches to a flat list sorted by age and remembers the choice', async () => {
  await openOverview();
  await screen.findByRole('region', { name: 'Fleisch' });
  await userEvent.click(screen.getByRole('button', { name: 'nach Alter' }));
  expect(rowNames()).toEqual(['Steak', 'Hackfleisch', 'Erbsen']);
  expect(screen.queryByRole('region', { name: 'Fleisch' })).toBeNull();
  expect(localStorage.getItem('fm.overviewMode')).toBe('age');
});

test('shows quantity, location, age and expiry status per row', async () => {
  await openOverview();
  const row = (await screen.findByText('Hackfleisch')).closest('a')!;
  expect(row).toHaveTextContent('500 g');
  expect(row).toHaveTextContent('Keller-Truhe › Schublade 2');
  expect(row).toHaveTextContent('vor 4 Monaten');
  expect(row).toHaveClass('status-ok');
  expect(screen.getByText('Steak').closest('a')).toHaveClass('status-overdue');
});

test('filters by freezer and search', async () => {
  const repo = await openOverview();
  await screen.findByText('Hackfleisch');
  await userEvent.selectOptions(screen.getByLabelText('Gerät'), kitchen.id);
  expect(rowNames()).toEqual(['Erbsen']);
  await userEvent.selectOptions(screen.getByLabelText('Gerät'), '');
  const [steak] = (await repo.listItems()).filter((i) => i.name === 'Steak');
  await userEvent.type(screen.getByLabelText('Suche'), steak.short_code.toLowerCase());
  expect(rowNames()).toEqual(['Steak']);
});

test('shows a hint when the freezer is empty', async () => {
  await openOverview([]);
  expect(await screen.findByText('Noch nichts eingefroren.')).toBeInTheDocument();
});

test('updates live when items change elsewhere', async () => {
  const repo = await openOverview([mince]);
  await screen.findByText('Hackfleisch');
  await repo.createItem(peas);
  expect(await screen.findByText('Erbsen')).toBeInTheDocument();
});

test('offers a retry when loading fails', async () => {
  const base = seededRepository();
  let fail = true;
  const repo = {
    ...base,
    listItems: vi.fn(async () => (fail ? Promise.reject(new Error('offline')) : base.listItems())),
  };
  renderApp('#/', repo);
  expect(await screen.findByText('Daten konnten nicht geladen werden.')).toBeInTheDocument();
  fail = false;
  await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
  expect(await screen.findByText('Noch nichts eingefroren.')).toBeInTheDocument();
});
