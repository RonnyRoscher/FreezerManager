import QRCode from 'qrcode';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { Label } from '../components/Label';
import { appBaseUrl, buildTakeUrl } from '../domain/qrUrl';
import type { ItemView } from '../domain/types';
import { loadLabelSize, pageCss } from './labelSettings';

export function qrDataUrl(item: ItemView): Promise<string> {
  return QRCode.toDataURL(buildTakeUrl(appBaseUrl(), item.id), { margin: 0, width: 300 });
}

let current: { root: Root; container: HTMLElement } | null = null;

/** Renders a single label into a print-only container and opens the print dialog. */
export async function printLabel(item: ItemView): Promise<void> {
  const size = loadLabelSize();
  const dataUrl = await qrDataUrl(item);

  current?.root.unmount();
  current?.container.remove();
  const container = document.createElement('div');
  container.id = 'print-root';
  document.body.appendChild(container);

  const root = createRoot(container);
  current = { root, container };
  flushSync(() =>
    root.render(
      <>
        <style>{pageCss(size)}</style>
        <Label item={item} size={size} qrDataUrl={dataUrl} />
      </>,
    ),
  );
  await container.querySelector('img')?.decode?.().catch(() => undefined);

  // The label stays in the (screen-hidden) print container until the next print:
  // browsers fire afterprint before they are done rendering, e.g. when the print
  // preview is regenerated after picking another printer or paper size.
  window.print();
}
