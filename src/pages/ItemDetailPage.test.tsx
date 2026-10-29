import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, seededRepository } from '../test/renderApp';
import { drawer2, meat } from '../test/fixtures';
import { printLabel } from '../print/printLabel';

vi.mock('../print/printLabel', () => ({ printLabel: vi.fn(async () => undefined) }));

test('shows all fields of an item', async () => {
  const repo = seededRepository();
  const item = await repo.createItem({
    name: 'Hackfleisch', details: 'für Bolognese', quantity: '500 g',
    category_id: meat.id, compartment_id: drawer2.id, frozen_at: '2026-01-15',
  });
  renderApp(`#/item/${item.id}`, repo);
  expect(await screen.findByRole('heading', { name: 'Hackfleisch' })).toBeInTheDocument();
  for (const text of ['500 g', 'für Bolognese', 'Fleisch', 'Keller-Truhe › Schublade 2', '15.01.2026', '15.07.2026', item.short_code]) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }
  expect(screen.getByRole('link', { name: 'Bearbeiten' })).toHaveAttribute('href', `#/item/${item.id}/edit`);
  await userEvent.click(screen.getByRole('button', { name: 'Label drucken' }));
  expect(printLabel).toHaveBeenCalledWith(expect.objectContaining({ id: item.id }));
  expect(screen.getByRole('button', { name: 'Entnehmen' })).toBeInTheDocument();
});

test('reports unknown items', async () => {
  renderApp('#/item/unbekannt');
  expect(await screen.findByText('Nicht (mehr) im Bestand')).toBeInTheDocument();
});
