import QRCode from 'qrcode';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Label } from '../components/Label';
import { appBaseUrl, buildTakeUrl } from '../domain/qrUrl';
import type { ItemView } from '../domain/types';
import { loadLabelSize, pageCss } from './labelSettings';

export function qrDataUrl(item: ItemView): Promise<string> {
  return QRCode.toDataURL(buildTakeUrl(appBaseUrl(), item.id), { margin: 0, width: 300 });
}

/** Renders a single label into a print-only container and opens the print dialog. */
export async function printLabel(item: ItemView): Promise<void> {
  const size = loadLabelSize();
  const dataUrl = await qrDataUrl(item);

  document.getElementById('print-root')?.remove();
  const container = document.createElement('div');
  container.id = 'print-root';
  document.body.appendChild(container);

  const root = createRoot(container);
  flushSync(() =>
    root.render(
      <>
        <style>{pageCss(size)}</style>
        <Label item={item} size={size} qrDataUrl={dataUrl} />
      </>,
    ),
  );
  await container.querySelector('img')?.decode?.().catch(() => undefined);

  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    root.unmount();
    container.remove();
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
