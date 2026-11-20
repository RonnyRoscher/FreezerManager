// THROWAWAY spike: checks whether the app can print directly to a Katasymbol/Supvan
// T50-series printer over WebHID. Not part of the app; delete after the experiment.
import QRCode from 'qrcode';
import { rgbaToBitmap } from './printer/bitmap';
import { hex } from './printer/channel';
import { T5080Driver } from './printer/families/t5080';
import { WebHidTransport } from './printer/transport';
import type { LabelSpec } from './printer/types';
import './druckTest.css';

const DPMM = 8;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const logEl = $('log');
const preview = $<HTMLCanvasElement>('preview');

let driver: T5080Driver | null = null;

function log(message: string) {
  const time = new Date().toLocaleTimeString('de-DE');
  logEl.textContent += `[${time}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function num(id: string) {
  return Number($<HTMLInputElement>(id).value);
}

function labelSpec(): LabelSpec {
  return {
    id: 'freezer-test',
    name: 'Test',
    lengthMm: num('length'),
    widthMm: num('width'),
    paperDirection: num('direction'),
    paperType: num('paperType'),
    gap: 3,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
  };
}

/** Draws the test label at printer resolution; returns the canvas used for printing. */
async function renderLabel(): Promise<HTMLCanvasElement> {
  const label = labelSpec();
  const w = Math.round(label.lengthMm * DPMM);
  const h = Math.round(label.widthMm * DPMM);
  const canvas = preview;
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${w * 2}px`;
  canvas.style.height = `${h * 2}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000';

  // Frame 1 mm inside the edge: shows offset and clipping on the printed label.
  ctx.lineWidth = 2;
  ctx.strokeRect(DPMM, DPMM, w - 2 * DPMM, h - 2 * DPMM);

  const qrSize = Math.min(h - 4 * DPMM, Math.round(w * 0.45));
  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, 'https://ronnyroscher.github.io/FreezerManager/#/', { margin: 0, width: qrSize });
  ctx.drawImage(qr, 2 * DPMM, Math.round((h - qrSize) / 2), qrSize, qrSize);

  const x = 2 * DPMM + qrSize + DPMM;
  ctx.textBaseline = 'top';
  ctx.font = `bold ${3 * DPMM}px Arial, sans-serif`;
  ctx.fillText('TEST', x, 3 * DPMM);
  ctx.font = `${2.4 * DPMM}px Arial, sans-serif`;
  ctx.fillText(`${label.lengthMm}×${label.widthMm} mm`, x, 7 * DPMM);
  ctx.fillText(new Date().toLocaleDateString('de-DE'), x, 10.5 * DPMM);
  ctx.fillText('↑ oben', x, 14 * DPMM);
  return canvas;
}

async function connect() {
  if (!('hid' in navigator)) {
    log('Dieser Browser unterstützt kein WebHID. Bitte Chrome oder Edge am PC verwenden.');
    return;
  }
  try {
    const devices = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x1820 }] });
    if (!devices.length) {
      log('Kein Drucker ausgewählt.');
      return;
    }
    for (const d of devices) {
      log(
        `Gefunden: "${d.productName}" vendor=0x${d.vendorId.toString(16)} product=0x${d.productId.toString(16)} ` +
          `collections=${d.collections.map((c) => `usagePage 0x${(c.usagePage ?? 0).toString(16)}`).join(', ')}`,
      );
    }
    const device = devices.find((d) => d.collections.some((c) => c.usagePage === 0xff00)) ?? devices[0];
    const transport = await WebHidTransport.open(device);
    driver = new T5080Driver(transport);
    driver.channel.debug = true;
    log(`Verbunden mit 0x${device.productId.toString(16)} (T50M-Puffermodus: ${driver.t50m ? 'ja' : 'nein'}).`);
    $<HTMLButtonElement>('status').disabled = false;
    $<HTMLButtonElement>('print').disabled = false;
  } catch (e) {
    log(`Verbinden fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function readStatus() {
  if (!driver) return;
  try {
    const s = await driver.getStatus();
    log(`Status: ${hex(s.raw.subarray(0, 12))}`);
    log(
      `  bereit=${!s.busy} druckt=${s.printing} pufferVoll=${s.bufferFull} gedruckt=${s.pagesPrinted} ` +
        `fehler=[${s.errors.join('; ')}] warnungen=[${s.warnings.join('; ')}]`,
    );
    const m = await driver.readMedia();
    if (m) {
      log(`Etikett laut Drucker: id=${m.labelId} typ=${m.paperType} länge=${m.lengthMm} breite=${m.widthMm} lücke=${m.gap}`);
      log(`  Rohdaten 0..31: ${hex(m.raw.subarray(0, 32))}`);
    }
  } catch (e) {
    log(`Status lesen fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function print() {
  if (!driver) return;
  const button = $<HTMLButtonElement>('print');
  button.disabled = true;
  try {
    const canvas = await renderLabel();
    const rgba = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const bitmap = rgbaToBitmap(rgba, canvas.width, canvas.height);
    const label = labelSpec();
    log(`Drucke ${canvas.width}×${canvas.height} Punkte, Ausrichtung ${label.paperDirection}, Typ ${label.paperType} …`);
    await driver.print([bitmap], label, {
      density: num('density'),
      copies: 1,
      onProgress: (p) => log(`  ${p.phase} ${p.page}/${p.pages}${p.message ? ` ${p.message}` : ''}`),
    });
    log('Fertig.');
  } catch (e) {
    log(`Drucken fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    button.disabled = false;
  }
}

$('connect').addEventListener('click', connect);
$('status').addEventListener('click', readStatus);
$('print').addEventListener('click', print);
for (const id of ['length', 'width', 'direction']) $(id).addEventListener('change', () => void renderLabel());
void renderLabel();
