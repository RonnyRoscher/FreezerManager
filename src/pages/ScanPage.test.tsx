import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, seededRepository } from '../test/renderApp';
import { drawer2, meat } from '../test/fixtures';
import { buildTakeUrl } from '../domain/qrUrl';

let scanner: { onResult: (text: string) => void; onError: (e: Error) => void };

vi.mock('../components/QrScanner', () => ({
  QrScanner: (props: typeof scanner) => {
    scanner = props;
    return <div data-testid="scanner" />;
  },
}));

async function openScanner() {
  const base = seededRepository();
  const item = await base.createItem({
    name: 'Hackfleisch', details: null, quantity: null,
    category_id: meat.id, compartment_id: drawer2.id, frozen_at: '2026-01-01',
  });
  const repo = { ...base, removeItem: vi.fn(base.removeItem) };
  renderApp('#/scan', repo);
  await screen.findByTestId('scanner');
  return { repo, item, url: buildTakeUrl('https://x.github.io/FreezerManager/', item.id) };
}

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

afterEach(() => {
  vi.useRealTimers();
});

test('shows a card for a scanned item', async () => {
  const { url } = await openScanner();
  act(() => scanner.onResult(url));
  expect(await screen.findByText('Hackfleisch')).toBeInTheDocument();
  expect(screen.getByText('Keller-Truhe › Schublade 2')).toBeInTheDocument();
});

test('ignores foreign QR codes', async () => {
  await openScanner();
  act(() => scanner.onResult('https://example.com'));
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByRole('button', { name: 'Entnehmen' })).toBeNull();
});

test('handles repeated scans of the same code only once', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { repo, url } = await openScanner();
  act(() => {
    for (let i = 0; i < 5; i++) scanner.onResult(url);
  });
  await screen.findByText('Hackfleisch');
  expect(screen.getAllByRole('button', { name: 'Entnehmen' })).toHaveLength(1);

  await user().click(screen.getByRole('button', { name: 'Entnehmen' }));
  await screen.findByText('Hackfleisch entnommen');
  act(() => scanner.onResult(url));
  act(() => {
    vi.advanceTimersByTime(8100);
  });
  expect(screen.queryByText('Hackfleisch entnommen')).toBeNull();

  act(() => scanner.onResult(url));
  act(() => {
    vi.advanceTimersByTime(3100);
  });
  act(() => scanner.onResult(url));
  expect(await screen.findByText('Nicht (mehr) im Bestand')).toBeInTheDocument();
  expect(repo.removeItem).toHaveBeenCalledTimes(1);
});

test('finds items by manually entered short code', async () => {
  const { item } = await openScanner();
  await userEvent.type(screen.getByLabelText('Kurzcode'), ` ${item.short_code.toLowerCase()} `);
  await userEvent.click(screen.getByRole('button', { name: 'Suchen' }));
  expect(await screen.findByText('Hackfleisch')).toBeInTheDocument();
});

test('reports unknown short codes', async () => {
  await openScanner();
  await userEvent.type(screen.getByLabelText('Kurzcode'), 'ZZZZ');
  await userEvent.click(screen.getByRole('button', { name: 'Suchen' }));
  expect(await screen.findByText('Nicht (mehr) im Bestand')).toBeInTheDocument();
});

test('falls back to manual entry when the camera is unavailable', async () => {
  await openScanner();
  act(() => scanner.onError(new Error('NotAllowedError')));
  expect(await screen.findByText('Kamera nicht verfügbar. Kurzcode manuell eingeben.')).toBeInTheDocument();
  expect(screen.getByLabelText('Kurzcode')).toBeVisible();
});
