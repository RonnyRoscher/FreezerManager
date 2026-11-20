import { paperPageCss, printOnPaper } from './printOnPaper';
import { makeItem } from '../test/fixtures';

beforeEach(() => {
  window.print = vi.fn();
});

test('puts the label at its real size on an A4 page and prints', async () => {
  await printOnPaper(makeItem(), { lengthMm: 40, widthMm: 30 });
  const roots = document.querySelectorAll('#print-root');
  expect(roots).toHaveLength(1);
  const img = roots[0].querySelector('img[alt="Etikett"]') as HTMLImageElement;
  expect(img).toHaveStyle({ width: '40mm', height: '30mm' });
  expect(img.src).toMatch(/^data:image\/png/);
  expect(roots[0].querySelector('style')?.textContent).toContain('@page { size: A4; margin: 10mm }');
  expect(window.print).toHaveBeenCalledTimes(1);
});

test('keeps the page after afterprint and replaces it on the next print', async () => {
  await printOnPaper(makeItem(), { lengthMm: 40, widthMm: 30 });
  window.dispatchEvent(new Event('afterprint'));
  expect(document.getElementById('print-root')).not.toBeNull();
  await printOnPaper(makeItem(), { lengthMm: 50, widthMm: 30 });
  expect(document.querySelectorAll('#print-root')).toHaveLength(1);
  expect(document.querySelector('#print-root img')).toHaveStyle({ width: '50mm' });
});

test('uses an A4 page with 10 mm margins', () => {
  expect(paperPageCss()).toBe('@page { size: A4; margin: 10mm }');
});
