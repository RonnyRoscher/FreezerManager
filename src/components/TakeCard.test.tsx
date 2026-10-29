import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TakeCard } from './TakeCard';
import { RepositoryProvider } from '../data/RepositoryContext';
import { seededRepository } from '../test/renderApp';
import { drawer2, meat } from '../test/fixtures';
import type { Repository } from '../data/repository';

async function setup(repoOverride?: (r: Repository) => Repository) {
  const base = seededRepository();
  const created = await base.createItem({
    name: 'Hackfleisch', details: null, quantity: null,
    category_id: meat.id, compartment_id: drawer2.id, frozen_at: '2026-01-01',
  });
  const repo = repoOverride ? repoOverride(base) : base;
  const item = (await base.getItem(created.id))!;
  const onDone = vi.fn();
  render(
    <RepositoryProvider repo={repo}>
      <MemoryRouter>
        <TakeCard item={item} onDone={onDone} />
      </MemoryRouter>
    </RepositoryProvider>,
  );
  return { repo: base, item, onDone };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

test('removes the item and allows undo with the same id', async () => {
  const { repo, item } = await setup();
  await user().click(screen.getByRole('button', { name: 'Entnehmen' }));
  expect(await screen.findByText('Hackfleisch entnommen')).toBeInTheDocument();
  expect(await repo.getItem(item.id)).toBeNull();
  await user().click(screen.getByRole('button', { name: 'Rückgängig' }));
  await screen.findByText('Rückgängig gemacht');
  expect((await repo.getItem(item.id))?.short_code).toBe(item.short_code);
});

test('hides the undo hint after 8 seconds and calls onDone', async () => {
  const { onDone } = await setup();
  await user().click(screen.getByRole('button', { name: 'Entnehmen' }));
  await screen.findByText('Hackfleisch entnommen');
  act(() => {
    vi.advanceTimersByTime(7900);
  });
  expect(onDone).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Rückgängig' })).toBeNull();
  expect(screen.getByText('Hackfleisch entnommen')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Entnehmen' })).toBeNull();
});

test('reports items that are already gone', async () => {
  await setup((r) => ({ ...r, removeItem: async () => null }));
  await user().click(screen.getByRole('button', { name: 'Entnehmen' }));
  expect(await screen.findByText('Nicht (mehr) im Bestand')).toBeInTheDocument();
});

test('reports a failed removal and keeps the button', async () => {
  await setup((r) => ({ ...r, removeItem: async () => Promise.reject(new Error('offline')) }));
  await user().click(screen.getByRole('button', { name: 'Entnehmen' }));
  expect(await screen.findByText('Speichern fehlgeschlagen. Bitte Verbindung prüfen.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Entnehmen' })).toBeInTheDocument();
});
