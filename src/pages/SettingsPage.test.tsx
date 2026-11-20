import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, seededRepository } from '../test/renderApp';
import { drawer2, meat } from '../test/fixtures';
import { loadDensity } from '../printer/density';
import { fakePrinter } from '../test/fakePrinter';
import type { PrinterState } from '../printer/printerService';

const item = (id: string) => ({
  id,
  short_code: id.toUpperCase(),
  name: 'Hackfleisch',
  details: null,
  quantity: null,
  category_id: meat.id,
  compartment_id: drawer2.id,
  frozen_at: '2026-10-01',
  created_at: '2026-10-01T00:00:00Z',
});

async function openSettings(repo = seededRepository()) {
  renderApp('#/settings', repo);
  await screen.findByRole('heading', { name: 'Gefriergeräte' });
  return repo;
}

test('adds a freezer and a compartment', async () => {
  const repo = await openSettings(seededRepository({ freezers: [], compartments: [] }));
  await userEvent.type(screen.getByLabelText('Neues Gerät'), 'Garage');
  await userEvent.click(screen.getByRole('button', { name: 'Gerät hinzufügen' }));
  expect(await screen.findByDisplayValue('Garage')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Neues Fach in Garage'), 'Schublade 1');
  await userEvent.click(screen.getByRole('button', { name: 'Fach zu Garage hinzufügen' }));
  expect(await screen.findByDisplayValue('Schublade 1')).toBeInTheDocument();
  const [garage] = await repo.listFreezers();
  expect(garage.compartments.map((c) => c.name)).toEqual(['Schublade 1']);
});

test('renames a compartment', async () => {
  const repo = await openSettings();
  const input = screen.getByLabelText('Fach Schublade 2');
  await userEvent.clear(input);
  await userEvent.type(input, 'Schublade unten');
  await userEvent.click(screen.getByRole('button', { name: 'Schublade 2 speichern' }));
  await screen.findByText('Gespeichert');
  const [cellar] = await repo.listFreezers();
  expect(cellar.compartments[0].name).toBe('Schublade unten');
});

test('reorders freezers', async () => {
  const repo = await openSettings();
  await userEvent.click(screen.getByRole('button', { name: 'Küche nach oben' }));
  await screen.findByText('Gespeichert');
  expect((await repo.listFreezers()).map((f) => f.name)).toEqual(['Küche', 'Keller-Truhe']);
});

test('refuses to delete a compartment that still holds items', async () => {
  await openSettings(seededRepository({ items: [item('a1'), item('a2')] }));
  await userEvent.click(screen.getByRole('button', { name: 'Schublade 2 löschen' }));
  expect(
    await screen.findByText('Kann nicht gelöscht werden: 2 Einträge vorhanden'),
  ).toBeInTheDocument();
  expect(screen.getByDisplayValue('Schublade 2')).toBeInTheDocument();
});

test('adds a category and changes its shelf life', async () => {
  const repo = await openSettings();
  const section = screen.getByRole('region', { name: 'Kategorien' });
  await userEvent.type(within(section).getByLabelText('Neue Kategorie'), 'Eis');
  const months = within(section).getByLabelText('Haltbarkeit neue Kategorie (Monate)');
  await userEvent.clear(months);
  await userEvent.type(months, '2');
  await userEvent.click(within(section).getByRole('button', { name: 'Kategorie hinzufügen' }));
  const shelfLife = await within(section).findByLabelText('Haltbarkeit Eis (Monate)');
  expect(shelfLife).toHaveValue(2);
  await userEvent.clear(shelfLife);
  await userEvent.type(shelfLife, '3');
  await userEvent.click(within(section).getByRole('button', { name: 'Eis speichern' }));
  await screen.findByText('Gespeichert');
  const eis = (await repo.listCategories()).find((c) => c.name === 'Eis');
  expect(eis?.max_months).toBe(3);
});

async function openPrinterSettings(state?: PrinterState) {
  const printer = fakePrinter(state);
  renderApp('#/settings', seededRepository(), printer);
  const section = await screen.findByRole('region', { name: 'Drucker' });
  return { printer, section };
}

test('shows the connected printer and its label roll', async () => {
  const { printer, section } = await openPrinterSettings();
  expect(within(section).getByText('Verbunden: T50M Pro · Etikett 40 × 30 mm')).toBeInTheDocument();
  await userEvent.click(within(section).getByRole('button', { name: 'Trennen' }));
  expect(printer.disconnect).toHaveBeenCalled();
});

test('says when the label roll is not recognized', async () => {
  const { section } = await openPrinterSettings({ status: 'ready', model: 'T50M Pro', media: null });
  expect(within(section).getByText('Verbunden: T50M Pro · Rolle nicht erkannt')).toBeInTheDocument();
});

test('offers to connect a printer', async () => {
  const { printer, section } = await openPrinterSettings({ status: 'disconnected', connectOnPrint: false });
  expect(within(section).getByText('Nicht verbunden')).toBeInTheDocument();
  await userEvent.click(within(section).getByRole('button', { name: 'Drucker verbinden' }));
  expect(printer.connect).toHaveBeenCalled();
});

test('explains that printing needs Chrome or Edge on a PC', async () => {
  const { section } = await openPrinterSettings({ status: 'unsupported' });
  expect(
    within(section).getByText('Direktdruck geht in Chrome oder Edge am PC (USB) und in Chrome auf Android-Handys (Bluetooth).'),
  ).toBeInTheDocument();
  expect(within(section).queryByRole('button', { name: 'Drucker verbinden' })).toBeNull();
});

test('shows connection errors with a retry', async () => {
  const { section } = await openPrinterSettings({
    status: 'error',
    message: 'Dieses Druckermodell wird nicht unterstützt (USB-ID 0x203e).',
  });
  expect(within(section).getByText('Dieses Druckermodell wird nicht unterstützt (USB-ID 0x203e).')).toBeInTheDocument();
  expect(within(section).getByRole('button', { name: 'Drucker verbinden' })).toBeInTheDocument();
});

test('stores the print density', async () => {
  const { section } = await openPrinterSettings();
  const density = within(section).getByLabelText('Druckdichte (1–9)');
  expect(density).toHaveValue(4);
  await userEvent.clear(density);
  await userEvent.type(density, '6');
  await userEvent.click(within(section).getByRole('button', { name: 'Druckdichte speichern' }));
  expect(loadDensity()).toBe(6);
});

test('no longer asks for a label size', async () => {
  await openPrinterSettings();
  expect(screen.queryByLabelText('Breite (mm)')).toBeNull();
});
