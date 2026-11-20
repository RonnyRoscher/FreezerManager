import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, seededRepository } from '../test/renderApp';
import { drawer2, meat } from '../test/fixtures';
import { fakePrinter } from '../test/fakePrinter';
import { PrinterUserError } from '../printer/printerMessages';
import { printOnPaper } from '../print/printOnPaper';

vi.mock('../print/printOnPaper', () => ({
  PAPER_FALLBACK_SIZE: { lengthMm: 40, widthMm: 30 },
  printOnPaper: vi.fn(async () => undefined),
}));

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
  renderApp(`#/item/${item.id}`, repo, fakePrinter({ status: 'disconnected', connectOnPrint: false }));
  expect(await screen.findByRole('button', { name: 'Label drucken' })).toBeDisabled();
  expect(screen.getByRole('link', { name: 'Drucker in den Einstellungen verbinden' })).toHaveAttribute('href', '#/settings');
});

test('explains printing needs Chrome or Edge on a PC', async () => {
  const { repo, item } = await itemInRepo();
  renderApp(`#/item/${item.id}`, repo, fakePrinter({ status: 'unsupported' }));
  expect(await screen.findByRole('button', { name: 'Label drucken' })).toBeDisabled();
  expect(
    screen.getByText('Direktdruck geht in Chrome oder Edge am PC (USB) und in Chrome auf Android-Handys (Bluetooth).'),
  ).toBeInTheDocument();
});

test('prints on paper even without a label printer', async () => {
  const { repo, item } = await itemInRepo();
  renderApp(`#/item/${item.id}`, repo, fakePrinter({ status: 'unsupported' }));
  const button = await screen.findByRole('button', { name: 'Auf Papier drucken' });
  expect(button).toBeEnabled();
  await userEvent.click(button);
  expect(printOnPaper).toHaveBeenCalledWith(expect.objectContaining({ id: item.id }), { lengthMm: 40, widthMm: 30 });
});

test('prints on paper in the size of the connected roll', async () => {
  const { repo, item } = await itemInRepo();
  renderApp(`#/item/${item.id}`, repo, fakePrinter({ status: 'ready', model: 'T50M Pro', media: { lengthMm: 50, widthMm: 30 } }));
  await userEvent.click(await screen.findByRole('button', { name: 'Auf Papier drucken' }));
  expect(printOnPaper).toHaveBeenLastCalledWith(expect.objectContaining({ id: item.id }), { lengthMm: 50, widthMm: 30 });
});

test('prints over Bluetooth without connecting in the settings first', async () => {
  const { repo, item } = await itemInRepo();
  const printer = fakePrinter({ status: 'disconnected', connectOnPrint: true });
  renderApp(`#/item/${item.id}`, repo, printer);
  const button = await screen.findByRole('button', { name: 'Label drucken' });
  expect(button).toBeEnabled();
  expect(screen.queryByRole('link', { name: 'Drucker in den Einstellungen verbinden' })).toBeNull();
  await userEvent.click(button);
  expect(printer.print).toHaveBeenCalledWith(expect.objectContaining({ id: item.id }));
  expect(document.querySelector('.error')).toBeNull();
});
