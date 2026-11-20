import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, seededRepository } from '../test/renderApp';
import { drawer2, meat } from '../test/fixtures';
import { fakePrinter } from '../test/fakePrinter';
import { PrinterUserError } from '../printer/printerMessages';

async function itemInRepo() {
  const repo = seededRepository();
  const item = await repo.createItem({
    name: 'Hackfleisch', details: null, quantity: null,
    category_id: meat.id, compartment_id: drawer2.id, frozen_at: '2026-01-15',
  });
  return { repo, item };
}

test('shows all fields of an item', async () => {
  const repo = seededRepository();
  const item = await repo.createItem({
    name: 'Hackfleisch', details: 'für Bolognese', quantity: '500 g',
    category_id: meat.id, compartment_id: drawer2.id, frozen_at: '2026-01-15',
  });
  const printer = fakePrinter();
  renderApp(`#/item/${item.id}`, repo, printer);
  expect(await screen.findByRole('heading', { name: 'Hackfleisch' })).toBeInTheDocument();
  for (const text of ['500 g', 'für Bolognese', 'Fleisch', 'Keller-Truhe › Schublade 2', '15.01.2026', '15.07.2026', item.short_code]) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }
  expect(screen.getByRole('link', { name: 'Bearbeiten' })).toHaveAttribute('href', `#/item/${item.id}/edit`);
  await userEvent.click(screen.getByRole('button', { name: 'Label drucken' }));
  expect(printer.print).toHaveBeenCalledWith(expect.objectContaining({ id: item.id }));
  expect(screen.getByRole('button', { name: 'Entnehmen' })).toBeInTheDocument();
});

test('reports unknown items', async () => {
  renderApp('#/item/unbekannt');
  expect(await screen.findByText('Nicht (mehr) im Bestand')).toBeInTheDocument();
});

test('shows why printing failed', async () => {
  const { repo, item } = await itemInRepo();
  const printer = fakePrinter();
  printer.print.mockRejectedValueOnce(new PrinterUserError('Der Deckel des Druckers ist offen.'));
  renderApp(`#/item/${item.id}`, repo, printer);
  await userEvent.click(await screen.findByRole('button', { name: 'Label drucken' }));
  expect(await screen.findByText('Der Deckel des Druckers ist offen.')).toBeInTheDocument();
});

test('points to the settings when no printer is connected', async () => {
  const { repo, item } = await itemInRepo();
  renderApp(`#/item/${item.id}`, repo, fakePrinter({ status: 'disconnected' }));
  expect(await screen.findByRole('button', { name: 'Label drucken' })).toBeDisabled();
  expect(screen.getByRole('link', { name: 'Drucker in den Einstellungen verbinden' })).toHaveAttribute('href', '#/settings');
});

test('explains printing needs Chrome or Edge on a PC', async () => {
  const { repo, item } = await itemInRepo();
  renderApp(`#/item/${item.id}`, repo, fakePrinter({ status: 'unsupported' }));
  expect(await screen.findByRole('button', { name: 'Label drucken' })).toBeDisabled();
  expect(
    screen.getByText('Drucken geht nur in Chrome oder Edge am PC mit per USB angeschlossenem Drucker.'),
  ).toBeInTheDocument();
});
