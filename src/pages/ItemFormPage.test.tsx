import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { printLabel } from '../print/printLabel';
import { renderApp, seededRepository } from '../test/renderApp';
import { cellar, drawer2, kitchen, meat, top, veg } from '../test/fixtures';
import { todayIso } from '../domain/dates';

vi.mock('../print/printLabel', () => ({ printLabel: vi.fn(async () => undefined) }));

async function openForm(repo = seededRepository()) {
  renderApp('#/new', repo);
  await screen.findByRole('heading', { name: 'Einfrieren' });
  await screen.findByRole('option', { name: 'Fleisch' });
  return repo;
}

async function fillRequired(name = 'Hackfleisch') {
  await userEvent.type(screen.getByLabelText('Name'), name);
  await userEvent.selectOptions(screen.getByLabelText('Kategorie'), meat.id);
  await userEvent.selectOptions(screen.getByLabelText('Gerät'), cellar.id);
  await userEvent.selectOptions(screen.getByLabelText('Fach'), drawer2.id);
}

test('prefills the freezing date with today', async () => {
  await openForm();
  expect(screen.getByLabelText('Eingefroren am')).toHaveValue(todayIso());
});

test('only offers compartments of the chosen freezer', async () => {
  await openForm();
  await userEvent.selectOptions(screen.getByLabelText('Gerät'), kitchen.id);
  const fach = screen.getByLabelText('Fach');
  expect(fach).toContainElement(screen.getByRole('option', { name: top.name }));
  expect(screen.queryByRole('option', { name: drawer2.name })).toBeNull();
});

test('requires a name', async () => {
  const repo = await openForm();
  await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  expect(await screen.findByText('Bitte Namen angeben')).toBeInTheDocument();
  expect(await repo.listItems()).toHaveLength(0);
});

test('saves, clears the item fields and keeps category and location for the next item', async () => {
  const repo = await openForm();
  await fillRequired();
  await userEvent.type(screen.getByLabelText('Menge'), '500 g');
  await userEvent.type(screen.getByLabelText('Details'), 'für Bolognese');
  await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

  await screen.findByText(/Gespeichert: Hackfleisch/);
  const [item] = await repo.listItems();
  expect(screen.getByText(`Gespeichert: Hackfleisch (${item.short_code})`)).toBeInTheDocument();
  expect(item).toMatchObject({ name: 'Hackfleisch', quantity: '500 g', details: 'für Bolognese' });
  expect(screen.getByLabelText('Name')).toHaveValue('');
  expect(screen.getByLabelText('Menge')).toHaveValue('');
  expect(screen.getByLabelText('Kategorie')).toHaveValue(meat.id);
  expect(screen.getByLabelText('Fach')).toHaveValue(drawer2.id);
});

test('preselects the last category and location after reopening', async () => {
  await openForm();
  await fillRequired();
  await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  await screen.findByText(/Gespeichert:/);
  document.body.innerHTML = '';

  await openForm();
  expect(screen.getByLabelText('Kategorie')).toHaveValue(meat.id);
  expect(screen.getByLabelText('Gerät')).toHaveValue(cellar.id);
  expect(screen.getByLabelText('Fach')).toHaveValue(drawer2.id);
});

test('suggests names from existing items', async () => {
  const repo = seededRepository();
  await repo.createItem({
    name: 'Erbsen', details: null, quantity: null,
    category_id: veg.id, compartment_id: top.id, frozen_at: '2026-01-01',
  });
  await openForm(repo);
  expect(await screen.findByRole('option', { name: 'Erbsen', hidden: true })).toBeInTheDocument();
});

test('"Speichern & Label drucken" prints the new item', async () => {
  await openForm();
  await fillRequired('Gulasch');
  await userEvent.click(screen.getByRole('button', { name: 'Speichern & Label drucken' }));
  await screen.findByText(/Gespeichert: Gulasch/);
  expect(printLabel).toHaveBeenCalledWith(expect.objectContaining({ name: 'Gulasch', freezer: cellar }));
});

test('keeps all input when saving fails', async () => {
  const base = seededRepository();
  const repo = { ...base, createItem: vi.fn(async () => Promise.reject(new Error('offline'))) };
  await openForm(repo);
  await fillRequired();
  await userEvent.type(screen.getByLabelText('Menge'), '500 g');
  await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  expect(await screen.findByText('Speichern fehlgeschlagen. Bitte Verbindung prüfen.')).toBeInTheDocument();
  expect(screen.getByLabelText('Name')).toHaveValue('Hackfleisch');
  expect(screen.getByLabelText('Menge')).toHaveValue('500 g');
  expect(screen.getByLabelText('Fach')).toHaveValue(drawer2.id);
});

test('edits an existing item and returns to its detail page', async () => {
  const repo = seededRepository();
  const item = await repo.createItem({
    name: 'Hackfleisch', details: null, quantity: null,
    category_id: meat.id, compartment_id: drawer2.id, frozen_at: '2026-01-01',
  });
  renderApp(`#/item/${item.id}/edit`, repo);
  const name = await screen.findByDisplayValue('Hackfleisch');
  expect(screen.getByLabelText('Eingefroren am')).toHaveValue('2026-01-01');
  await userEvent.clear(name);
  await userEvent.type(name, 'Rinderhack');
  await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  await vi.waitFor(() => expect(window.location.hash).toBe(`#/item/${item.id}`));
  expect((await repo.getItem(item.id))?.name).toBe('Rinderhack');
});

test('a failed print after saving does not report the save as failed', async () => {
  vi.mocked(printLabel).mockRejectedValueOnce(new Error('print'));
  const repo = await openForm();
  await fillRequired('Gulasch');
  await userEvent.click(screen.getByRole('button', { name: 'Speichern & Label drucken' }));
  expect(await screen.findByText('Gespeichert, aber Drucken fehlgeschlagen.')).toBeInTheDocument();
  expect(screen.queryByText('Speichern fehlgeschlagen. Bitte Verbindung prüfen.')).toBeNull();
  expect(screen.getByLabelText('Name')).toHaveValue('');
  expect(await repo.listItems()).toHaveLength(1);
});
