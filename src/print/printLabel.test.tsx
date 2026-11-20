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

test('renders the label with the page size and prints', async () => {
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

});

test('keeps the label after afterprint so a regenerated print preview is not blank', async () => {
  await printLabel(makeItem({ name: 'Erbsen' }));
  window.dispatchEvent(new Event('afterprint'));
  expect(document.getElementById('print-root')).toHaveTextContent('Erbsen');
});

test('replaces the previous label on the next print', async () => {
  await printLabel(makeItem({ name: 'Erbsen' }));
  await printLabel(makeItem({ name: 'Gulasch' }));
  const roots = document.querySelectorAll('#print-root');
  expect(roots).toHaveLength(1);
  expect(roots[0]).toHaveTextContent('Gulasch');
  expect(roots[0]).not.toHaveTextContent('Erbsen');
});
