import QRCode from 'qrcode';
import { printLabel } from './printLabel';
import { saveLabelSize } from './labelSettings';
import { makeItem } from '../test/fixtures';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,QR') },
}));

beforeEach(() => {
  window.print = vi.fn();
});

test('renders the label with the page size, prints and cleans up afterwards', async () => {
  saveLabelSize({ widthMm: 54, heightMm: 25 });
  const item = makeItem({ name: 'Erbsen' });
  await printLabel(item);

  expect(QRCode.toDataURL).toHaveBeenCalledWith(
    expect.stringMatching(new RegExp(`/FreezerManager/#/take/${item.id}$`)),
    expect.anything(),
  );
  const root = document.getElementById('print-root')!;
  expect(root).toHaveTextContent('Erbsen');
  expect(root.querySelector('style')?.textContent).toContain('@page { size: 54mm 25mm; margin: 0 }');
  expect(window.print).toHaveBeenCalledTimes(1);

  window.dispatchEvent(new Event('afterprint'));
  expect(document.getElementById('print-root')).toBeNull();
});
