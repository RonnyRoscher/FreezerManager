// THROWAWAY spike: checks whether the phone can print to the T50M Pro over Web Bluetooth.
// Not part of the app; delete after the experiment.
import type { ItemView } from '../domain/types';
import { drawLabel, labelBitmap } from '../printer/labelBitmap';
import { WebBluetoothTransport } from '../printer/vendor/ble';
import { hex } from '../printer/vendor/channel';
import { T5080BtDriver } from '../printer/vendor/families/t5080-bt';
import type { LabelSpec } from '../printer/vendor/types';
import './btTest.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const logEl = $('log');
let driver: T5080BtDriver | null = null;
let transport: WebBluetoothTransport | null = null;

function log(message: string) {
  logEl.textContent += `[${new Date().toLocaleTimeString('de-DE')}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

const errorText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

const testItem: ItemView = {
  id: '00000000-0000-4000-8000-000000000001',
  short_code: 'TEST',
  name: 'Bluetooth-Test',
  details: null,
  quantity: 'Handy',
  category_id: 'c',
  compartment_id: 'f',
  frozen_at: new Date().toISOString().slice(0, 10),
  created_at: new Date().toISOString(),
  category: { id: 'c', name: 'Test', max_months: 6 },
  compartment: { id: 'f', freezer_id: 'g', name: 'Fach', sort_order: 0 },
  freezer: { id: 'g', name: 'Gerät', sort_order: 0 },
};

async function connect() {
  if (!('bluetooth' in navigator)) {
    log('Dieser Browser unterstützt kein Web Bluetooth. Bitte Chrome am Android-Handy verwenden.');
    return;
  }
  try {
    const device = await WebBluetoothTransport.request();
    log(`Ausgewählt: "${device.name}" (id ${device.id})`);
    transport = await WebBluetoothTransport.open(device);
    log(`Verbunden: ${transport.summary}`);
    driver = new T5080BtDriver(transport, 384, { acksDataFrames: false, commandTimeoutMs: 4000 });
    const s = await driver.handshake();
    log(`Handshake ok: bereit=${!s.busy} fehler=[${s.errors.join('; ')}]`);
    device.addEventListener('gattserverdisconnected', () => {
      log('Bluetooth-Verbindung getrennt.');
      $<HTMLButtonElement>('status').disabled = true;
      $<HTMLButtonElement>('print').disabled = true;
    });
    $<HTMLButtonElement>('status').disabled = false;
    $<HTMLButtonElement>('print').disabled = false;
  } catch (e) {
    log(`Verbinden fehlgeschlagen: ${errorText(e)}`);
    await transport?.close().catch(() => {});
  }
}

async function readStatus() {
  if (!driver) return;
  try {
    const s = await driver.getStatus();
    log(`Status: ${hex(s.raw.subarray(0, 12))}`);
    log(`  bereit=${!s.busy} druckt=${s.printing} fehler=[${s.errors.join('; ')}] warnungen=[${s.warnings.join('; ')}]` +
      (s.batteryLevel !== undefined ? ` akku=${s.batteryVolts?.toFixed(2)} V (${s.batteryLevel}/4)` : ''));
    const m = await driver.readMedia();
    if (m) log(`Etikett laut Drucker: id=${m.labelId} typ=${m.paperType} länge=${m.lengthMm} breite=${m.widthMm} lücke=${m.gap}`);
  } catch (e) {
    log(`Status lesen fehlgeschlagen: ${errorText(e)}`);
  }
}

async function print() {
  if (!driver) return;
  const button = $<HTMLButtonElement>('print');
  button.disabled = true;
  try {
    const media = await driver.readMedia();
    const size = media?.lengthMm && media.widthMm ? { lengthMm: media.lengthMm, widthMm: media.widthMm } : { lengthMm: 40, widthMm: 30 };
    log(`Etikettgröße ${size.lengthMm} × ${size.widthMm} mm${media?.lengthMm ? '' : ' (nicht erkannt, Standard)'}`);
    drawLabel($<HTMLCanvasElement>('preview'), testItem, size);
    const label: LabelSpec = {
      id: String(media?.labelId ?? 0),
      name: '',
      ...size,
      paperDirection: 1,
      paperType: media?.paperType ?? 1,
      gap: media?.gap ?? 3,
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
    };
    const started = Date.now();
    await driver.print([labelBitmap(testItem, size)], label, {
      density: Number($<HTMLInputElement>('density').value),
      copies: 1,
      onProgress: (p) => log(`  ${p.phase} ${p.page}/${p.pages}${p.message ? ` ${p.message}` : ''}`),
    });
    log(`Fertig nach ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  } catch (e) {
    log(`Drucken fehlgeschlagen: ${errorText(e)}`);
  } finally {
    button.disabled = false;
  }
}

$('connect').addEventListener('click', connect);
$('status').addEventListener('click', readStatus);
$('print').addEventListener('click', print);
