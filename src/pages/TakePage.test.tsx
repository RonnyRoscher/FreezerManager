import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, seededRepository } from '../test/renderApp';
import { drawer2, meat } from '../test/fixtures';

test('shows the item and removes it', async () => {
  const repo = seededRepository();
  const item = await repo.createItem({
    name: 'Hackfleisch', details: null, quantity: '500 g',
    category_id: meat.id, compartment_id: drawer2.id, frozen_at: '2026-01-01',
  });
  renderApp(`#/take/${item.id}`, repo);
  expect(await screen.findByText('Keller-Truhe › Schublade 2')).toBeInTheDocument();
  expect(screen.getByText('Hackfleisch')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Entnehmen' }));
  expect(await screen.findByText('Hackfleisch entnommen')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Zur Übersicht' })).toBeInTheDocument();
  expect(await repo.getItem(item.id)).toBeNull();
});

test('reports unknown items with a link to the overview', async () => {
  renderApp('#/take/0b9f8c1e-5d1a-4c7e-9a7b-2f1e3d4c5b6a');
  expect(await screen.findByText('Nicht (mehr) im Bestand')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Zur Übersicht' })).toBeInTheDocument();
});
