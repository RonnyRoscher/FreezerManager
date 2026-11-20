# Direktdruck auf den Etikettendrucker – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Etiketten werden ohne Druckdialog per USB (WebHID) direkt an einen Katasymbol/Supvan-T50/T80-Drucker geschickt; als Notlösung lässt sich ein einzelnes Etikett auf A4 zum Ausschneiden drucken.

**Architecture:** Der im Spike erprobte Druckercode (MIT, vendored) wandert nach `src/printer/vendor/`. Darüber liegen reine Layout-Funktionen, ein Canvas-Renderer, der ein `ItemView` in eine 1-Bit-Bitmap mit 8 Punkten/mm verwandelt, und ein `PrinterService`, der Verbindung und Druckaufträge verwaltet und das USB-Gerät nur pro Gespräch öffnet. React-Seiten greifen über `PrinterProvider`/`usePrinter()` darauf zu.

**Tech Stack:** React 18 + TypeScript, Vitest + Testing Library (jsdom), WebHID (`@types/w3c-web-hid`), `qrcode` (`QRCode.create`), neu als devDependency: `canvas` (Canvas für jsdom-Tests).

**Spec:** `docs/superpowers/specs/2026-11-20-direct-label-printing-design.md`

## Global Constraints

- Direktdruck ist Standard; `window.print()` nur noch für „Auf Papier drucken“ (Detailseite). Keine Labelgröße-Einstellung mehr.
- Papierdruck: `@page { size: A4; margin: 10mm }`, Etikett oben links in Originalgröße (Rolle des verbundenen Druckers, sonst 40 × 30 mm), gestrichelte Schnittlinie `0.2mm dashed #000` um das Etikett, Bild in 24 Punkte/mm.
- Oberfläche Deutsch, Code-Bezeichner Englisch.
- Vendored Code (`src/printer/vendor/`) bleibt inhaltlich unverändert gegenüber `src/spike/printer/` (Commit `fd7b53e` von khromov/supvan-katasymbol-printer-web-ui); einzige Ergänzung: `devices.ts` (nur Familie `t5080`). `lzma.js` nie durch Standard-LZMA ersetzen. Lizenzdatei und `SOURCE.txt` bleiben.
- Druckerauflösung 8 Punkte/mm; Etikett-Canvas `lengthMm × 8` breit, `widthMm × 8` hoch (40 × 30 mm → 320 × 240).
- Druckparameter: `copies: 1`, `paperDirection: 1`, `paperType` und `gap` aus der Rolle (Fallback 1 bzw. 3), Dichte 1–9 aus `localStorage` `fm.printDensity`, Standard 4.
- USB-Gerät nur während eines Gesprächs geöffnet (Verbinden/Status, Druckauftrag), danach `close()`.
- WebHID-Filter: `{ vendorId: 0x1820 }`; Gerät mit HID-Collection `usagePage 0xff00` bevorzugen.
- Fehlermeldungen (exakt):
  - Deckel offen → `Der Deckel des Druckers ist offen.`
  - Rolle falsch eingelegt → `Die Etikettenrolle ist nicht richtig eingelegt.`
  - Kein Etikett → `Kein Etikett erkannt.`
  - Leer → `Keine Etiketten mehr.`
  - Druckkopf heiß → `Der Druckkopf ist zu heiß. Bitte kurz warten.`
  - Keine Antwort → `Drucker antwortet nicht. Ist er eingeschaltet und per USB verbunden?`
  - Öffnen fehlgeschlagen → `Drucker ist von einem anderen Programm belegt (z. B. Katasymbol-App).`
  - Rolle unlesbar/Größe 0 → `Etikettenrolle nicht erkannt.`
  - Getrennt → `Drucker wurde getrennt.`
  - Läuft schon → `Es wird bereits gedruckt.`
  - Unbekanntes Modell → `Dieses Druckermodell wird nicht unterstützt (USB-ID 0x207f).` (mit tatsächlicher ID, 4-stellig hex)
  - Sonst → `Drucken fehlgeschlagen: <Originalmeldung>`
- Ohne WebHID: `Drucken geht nur in Chrome oder Edge am PC mit per USB angeschlossenem Drucker.`

## Review Focus

1. Doppelklick auf „Label drucken“ → genau ein Druckauftrag, der zweite Aufruf meldet `Es wird bereits gedruckt.` (Test in Task 5).
2. Sehr langer Name oder Ort → höchstens zwei Zeilen, letzte mit „…“, nichts ragt über das Etikett (Test in Task 2).
3. Eintrag ohne Menge und Details → keine leere Zeile, kein „ · “ (Test in Task 2).
4. Drucker ab- und wieder angesteckt → Zustand `disconnected`, dann wieder `ready` ohne Klick (Test in Task 5).
5. App-Neustart mit zurückgezogener Freigabe (`getDevices()` leer) → `disconnected`, kein Fehler (Test in Task 5).

---

## Dateistruktur

```
src/printer/vendor/            übernommener Druckercode (aus src/spike/printer/, git mv) + devices.ts
src/printer/labelLayout.ts     reine Funktionen: Zeileninhalte, Umbruch, Geometrie
src/printer/labelBitmap.ts     Canvas-Zeichnung → Bitmap
src/printer/density.ts         Druckdichte laden/speichern
src/printer/printerMessages.ts Fehler → deutsche Meldung
src/printer/printerService.ts  PrinterState, Printer-Interface, createPrinterService()
src/printer/PrinterContext.tsx PrinterProvider, usePrinter()
src/test/fakeHid.ts            simuliertes HID-Gerät/HID-Objekt für Tests
src/test/fakePrinter.ts        Printer-Stub für Seitentests
```

---

### Task 1: Druckercode übernehmen, Testseite entfernen

**Files:**
- Move: `src/spike/printer/**` → `src/printer/vendor/**` (`git mv`)
- Create: `src/printer/vendor/devices.ts`, `src/printer/vendor/devices.test.ts`, `src/printer/vendor/t5080.test.ts`
- Delete: `druck-test.html`, `src/spike/druckTest.ts`, `src/spike/druckTest.css`
- Modify: `vite.config.ts` (Build-Eintrag `drucktest` und `navigateFallbackDenylist` entfernen), `src/printer/vendor/SOURCE.txt` (Zeile ergänzen: devices.ts auf Familie t5080 gekürzt)

**Interfaces:**
- Produces (`devices.ts`): `SUPVAN_VENDOR_ID = 0x1820`; `interface DeviceModel { productId: number; name: string; family: 't5080'; dpmm: 8; headDots: number }`; `T5080_MODELS: DeviceModel[]` (alle 15 `t5080`-Zeilen des Originals: 0x2072 T50M Plus, 0x2074 T50S, 0x2073/0x2076/0x207f T50M Pro, 0x2077 T50i, 0x2075 T80M, 0x207a/0x2078 T80M Pro, 0x2071/0x207d/0x2170 T50 Max, 0x2070 T50M, 0x2079 A80 Pro, 0x207e T80 Max; headDots 384 bzw. 576 wie im Original); `findT5080Model(productId: number): DeviceModel | undefined`.

- [ ] **Step 1: Failing tests**
  - `devices.test.ts`: `findT5080Model(0x207f)?.name` → `'T50M Pro'`, `headDots` → 384; `findT5080Model(0x207a)?.headDots` → 576; `findT5080Model(0x203e)` (SP650) → `undefined`.
  - `t5080.test.ts` (sichert den übernommenen Encoder): eine 320 × 240-Bitmap mit schwarzem Rechteck, `encodeT5080Page(bitmap, label40x30, { density: 4, headDots: 384, printEnd: true })` → jeder `chunk` lässt sich mit `LZMA.decompress` entpacken; entpackte Länge = `buffers.length * 4096`; für jeden Puffer gilt die Prüfsumme (Summe Bytes 2..13 plus letztes Byte jedes vollen 256er-Blocks, 16 Bit) = `buf[0] | buf[1] << 8`; `buffers.at(-1)[2] & 0x0c` → `0x0c` (Seiten- und Druckende).
- [ ] **Step 2:** Code nach `src/printer/vendor/` verschieben, Imports anpassen; `npx vitest run src/printer` → FAIL (devices fehlt).
- [ ] **Step 3:** `devices.ts` anlegen; Spike-Dateien löschen; `vite.config.ts` zurückbauen.
- [ ] **Step 4:** `npx vitest run` → PASS; `npm run build` → erfolgreich, `dist/` enthält kein `druck-test.html`.
- [ ] **Step 5: Commit** `refactor: move vendored printer code to src/printer, drop spike page`

### Task 2: Etikett-Layout (reine Funktionen)

**Files:**
- Create: `src/printer/labelLayout.ts`, `src/printer/labelLayout.test.ts`

**Interfaces:**
- Consumes: `ItemView` (`src/domain/types.ts`), `formatDate` (`src/domain/dates.ts`).
- Produces:
  - `type LabelSizeMm = { lengthMm: number; widthMm: number }`
  - `labelLines(item: ItemView): { name: string; extra: string | null; category: string; date: string; location: string; code: string }` – `extra` = Menge und Details mit `' · '` verbunden, leere weggelassen, beides leer → `null`; `location` = `Gerät › Fach`; `date` = `TT.MM.JJJJ`.
  - `wrapText(text: string, maxWidth: number, measure: (s: string) => number, maxLines: number): string[]` – Umbruch an Leerzeichen; Wort breiter als `maxWidth` wird zeichenweise getrennt; mehr Zeilen als `maxLines` → letzte erlaubte Zeile so gekürzt, dass sie mit `'…'` in `maxWidth` passt.
  - `labelGeometry(size: LabelSizeMm): { width: number; height: number; margin: number; qr: { x: number; y: number; size: number }; text: { x: number; width: number }; fontPx: { name: number; body: number } }` – Werte in Punkten (8/mm): `margin` 8; `qr.size = min(height − 16, round(width × 0.45))`; `qr.x = 8`; `qr.y = round((height − qr.size) / 2)`; `text.x = 8 + qr.size + 12`; `text.width = width − text.x − 8`; `fontPx.body = round(19 × height / 240)`, `fontPx.name = round(23 × height / 240)`.

- [ ] **Step 1: Failing tests**
  - `labelLines`: Menge `'500 g'` + Details `'mit Zwiebeln'` → `extra` `'500 g · mit Zwiebeln'`; nur Details → `'mit Zwiebeln'`; beides `null` → `null` (Review Focus 3); `location` `'Keller-Truhe › Schublade 2'`; `date` `'03.10.2026'` für `frozen_at '2026-10-03'`.
  - `wrapText` mit `measure = (s) => s.length * 10`:
    - `('Hackfleisch', 200, m, 2)` → `['Hackfleisch']`
    - `('Keller-Truhe › Schublade 2', 150, m, 2)` → `['Keller-Truhe ›', 'Schublade 2']`
    - `('Rinderrouladen', 100, m, 2)` → `['Rinderroul', 'aden']` (hart getrennt)
    - `('eins zwei drei vier fünf sechs', 100, m, 2)` → zwei Zeilen, zweite endet auf `'…'`, jede Zeile `measure ≤ 100` (Review Focus 2)
  - `labelGeometry({ lengthMm: 40, widthMm: 30 })` → `width 320, height 240, qr { x: 8, y: 48, size: 144 }, text { x: 164, width: 148 }, fontPx { name: 23, body: 19 }`; `labelGeometry({ lengthMm: 62, widthMm: 29 }).qr.size` → 216.
- [ ] **Step 2:** `npx vitest run src/printer/labelLayout` → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5: Commit** `feat: add label layout helpers for direct printing`

### Task 3: Etikett als Bitmap zeichnen

**Files:**
- Create: `src/printer/labelBitmap.ts`, `src/printer/labelBitmap.test.ts`
- Modify: `package.json` (devDependency `canvas`, damit jsdom ein 2D-Canvas hat)

**Interfaces:**
- Consumes: Task 2 (`labelLines`, `wrapText`, `labelGeometry`, `LabelSizeMm`); `buildTakeUrl`, `appBaseUrl` (`src/domain/qrUrl.ts`); `rgbaToBitmap`, `Bitmap` (vendor).
- Produces: `drawLabel(canvas: HTMLCanvasElement, item: ItemView, size: LabelSizeMm, scale = 1): void` (Canvas wird auf `width × scale`, `height × scale` gesetzt, Zeichnung per `ctx.scale(scale, scale)` in denselben Punkt-Koordinaten) und `labelBitmap(item: ItemView, size: LabelSizeMm): Bitmap` (`scale` 1, danach `rgbaToBitmap`).

Zeichenregeln: weißer Hintergrund; QR über `QRCode.create(url, { errorCorrectionLevel: 'M' })`, jedes Modul als schwarzes Rechteck mit ganzzahliger Modulgröße `floor(qr.size / modules)`, im QR-Feld zentriert; Text links bündig ab `text.x`, Schrift `Arial, Helvetica, sans-serif`: Name fett `fontPx.name` (max. 2 Zeilen), `extra`, Kategorie, Datum je `fontPx.body` (1 Zeile, mit `wrapText(…, 1)`), Ort `fontPx.body` (max. 2 Zeilen), Kurzcode fett `fontPx.body` in `'Courier New', monospace`; Zeilenhöhe 1,2 × Schriftgröße; Textblock vertikal zentriert.

- [ ] **Step 1: Failing tests** (Fixtures `makeItem`)
  - `labelBitmap(item, { lengthMm: 40, widthMm: 30 })` → `width` 320, `height` 240, `data.length` 76800.
  - Ecke `(0,0)` und rechter Rand (`x = 319`) weiß (`data[i] === 0`).
  - QR-Feld `x 8..151, y 48..191` enthält schwarze Punkte; Textfeld `x 164..311` enthält schwarze Punkte.
  - Zwei Etiketten für Items mit verschiedener `id` unterscheiden sich im QR-Feld.
  - `drawLabel(canvas, item, size40x30, 3)` → `canvas.width` 960, `canvas.height` 720.
- [ ] **Step 2:** `npm i -D canvas`; `npx vitest run src/printer/labelBitmap` → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Tests → PASS. Manuell: Bitmap einmal als PNG ausgeben (Wegwerf-Skript im Scratchpad) und mit dem Testdruck-Foto vergleichen – gut lesbar bei 40 × 30.
- [ ] **Step 5: Commit** `feat: render labels as printer bitmaps`

### Task 4: Druckdichte und Fehlermeldungen

**Files:**
- Create: `src/printer/density.ts`, `src/printer/printerMessages.ts`, Tests daneben

**Interfaces:**
- Produces: `DEFAULT_DENSITY = 4`; `loadDensity(): number` (ungültig/fehlend → 4, auf 1–9 begrenzt); `saveDensity(d: number): void`; `printerErrorMessage(e: unknown): string`.

- [ ] **Step 1: Failing tests**
  - `loadDensity()` ohne Eintrag → 4; nach `saveDensity(7)` → 7; `localStorage['fm.printDensity'] = '12'` → 9; `'x'` → 4.
  - `printerErrorMessage(new PrinterError('Label cover is open', 'device'))` → `'Der Deckel des Druckers ist offen.'`; ebenso die übrigen vier Gerätefehler laut Global Constraints; `new PrinterError('Printer did not respond', 'timeout')` → Keine-Antwort-Text; `new Error('xyz')` → `'Drucken fehlgeschlagen: xyz'`; bereits deutsche `Error`-Meldungen aus dem Service (z. B. `'Etikettenrolle nicht erkannt.'`) bleiben unverändert (Erkennung: Klasse `PrinterUserError` aus diesem Modul, `export class PrinterUserError extends Error`).
- [ ] **Step 2:** Tests → FAIL. **Step 3:** Implementieren. **Step 4:** Tests → PASS.
- [ ] **Step 5: Commit** `feat: add print density setting and printer error messages`

### Task 5: PrinterService

**Files:**
- Create: `src/printer/printerService.ts`, `src/printer/printerService.test.ts`, `src/test/fakeHid.ts`

**Interfaces:**
- Consumes: Tasks 1, 3, 4; `ItemView`.
- Produces:
  ```ts
  type MediaSize = { lengthMm: number; widthMm: number };
  type PrinterState =
    | { status: 'unsupported' }
    | { status: 'disconnected' }
    | { status: 'connecting' }
    | { status: 'ready'; model: string; media: MediaSize | null }
    | { status: 'printing'; model: string; media: MediaSize | null }
    | { status: 'error'; message: string };
  interface Printer {
    getState(): PrinterState;
    subscribe(listener: (s: PrinterState) => void): () => void;
    init(): Promise<void>;        // getDevices() + hid connect/disconnect Listener
    connect(): Promise<void>;     // requestDevice, dann wie init
    disconnect(): Promise<void>;  // device.forget(), → disconnected
    print(item: ItemView): Promise<void>; // wirft PrinterUserError mit deutscher Meldung
  }
  createPrinterService(hid: HID | undefined = navigator.hid): Printer
  ```
- `src/test/fakeHid.ts`: `createFakeHid(options?)` → `{ hid, device, sent: number[][], unplug(), plug() }`. Optionen: `productId` (Standard 0x207f), `status` (8 Statusbytes für INQUIRY, Standard alles 0), `media` (`{ lengthMm, widthMm, paperType, gap }`, Standard 40/30/1/3; in RETURN_MAT-Antwort bei Byte 18–21), `silent` (antwortet nie), `openFails`, `granted` (ob `getDevices()` das Gerät liefert, Standard true). Antwortlogik wie im Spike-Check (jede Sendung → 64-Byte-Antwort nach 2 ms; `START_PRINT` setzt kurz das „druckt“-Bit).

Verhalten:
- Ohne `hid` → Zustand `unsupported`, alle Methoden außer `getState/subscribe` tun nichts bzw. werfen den Ohne-WebHID-Text.
- Verbinden (init/connect): Modell über `findT5080Model`, unbekannt → `error` mit Modelltext; Gerät öffnen, `readMedia()`, schließen → `ready` mit `media` (0/fehlend → `null`); Öffnen fehlgeschlagen → `ready` mit `media: null`.
- `print`: läuft schon → `PrinterUserError('Es wird bereits gedruckt.')`; Zustand `printing`; öffnen, `readMedia` (0 → `Etikettenrolle nicht erkannt.`), `labelBitmap(item, media)`, `T5080Driver.print([bitmap], label, { density: loadDensity(), copies: 1 })`, schließen; Zustand zurück auf `ready` (mit frischer `media`), auch bei Fehler. Fehler → `PrinterUserError(printerErrorMessage(e))`.
- `hid` `disconnect`-Ereignis für das Gerät → `disconnected` (läuft gerade ein Druck: dieser scheitert mit `Drucker wurde getrennt.`); `connect`-Ereignis eines Supvan-Geräts → wie init.

- [ ] **Step 1: Failing tests** (`vi.useFakeTimers({ shouldAdvanceTime: true })` wo Zeitüberschreitungen nötig sind)
  - ohne hid → `unsupported`.
  - `init()` mit freigegebenem Gerät → `{ status: 'ready', model: 'T50M Pro', media: { lengthMm: 40, widthMm: 30 } }`; Gerät danach geschlossen (`device.opened === false`).
  - `init()` mit `granted: false` → `disconnected` (Review Focus 5).
  - `productId 0x203e` → `error` `'Dieses Druckermodell wird nicht unterstützt (USB-ID 0x203e).'`.
  - `print(item)` → gesendete Befehlsbytes (Byte 4 der `C0 40`-Rahmen) enthalten in dieser Reihenfolge `0x30, 0x12, 0x11, 0x13, 0x5c, 0x10`; Zustand danach `ready`; Gerät geschlossen.
  - Status mit Deckel-offen-Bit (Antwortbyte 3 = `0x08`) → `print` wirft `'Der Deckel des Druckers ist offen.'`, Zustand `ready`.
  - `silent` → `print` wirft Keine-Antwort-Text.
  - `media` Länge 0 → `print` wirft `'Etikettenrolle nicht erkannt.'`.
  - zwei `print` gleichzeitig → zweiter wirft `'Es wird bereits gedruckt.'`, `START_PRINT` genau einmal gesendet (Review Focus 1).
  - `unplug()` → `disconnected`; `plug()` → wieder `ready` (Review Focus 4).
  - `disconnect()` → `device.forget` aufgerufen, Zustand `disconnected`.
- [ ] **Step 2:** Tests → FAIL. **Step 3:** Implementieren. **Step 4:** Tests → PASS.
- [ ] **Step 5: Commit** `feat: add printer service for direct USB printing`

### Task 6: App-Anbindung und Einstellungen › Drucker

**Files:**
- Create: `src/printer/PrinterContext.tsx`, `src/test/fakePrinter.ts`
- Modify: `src/App.tsx`, `src/main.tsx`, `src/test/renderApp.tsx`, `src/App.test.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: Task 4 (`loadDensity`, `saveDensity`), Task 5 (`Printer`, `PrinterState`, `createPrinterService`).
- Produces: `PrinterProvider({ printer, children })` (ruft einmal `printer.init()` auf); `usePrinter(): { state: PrinterState; connect(): Promise<void>; disconnect(): Promise<void>; print(item: ItemView): Promise<void> }`; `App({ repo, printer, authMessage? })`; `fakePrinter(state?: PrinterState): Printer & { print: Mock; connect: Mock; disconnect: Mock; setState(s: PrinterState): void }` (Standard `{ status: 'ready', model: 'T50M Pro', media: { lengthMm: 40, widthMm: 30 } }`); `renderApp(route, repo?, printer = fakePrinter())`.

- [ ] **Step 1: Failing tests** in `SettingsPage.test.tsx` (Abschnitt „Label“-Tests ersetzen):
  - Region „Drucker“: bei `ready` Text `'Verbunden: T50M Pro · Etikett 40 × 30 mm'` und Button „Trennen“ (ruft `disconnect`); `media: null` → `'Verbunden: T50M Pro · Rolle nicht erkannt'`.
  - `disconnected` → `'Nicht verbunden'` und Button „Drucker verbinden“ (ruft `connect`).
  - `unsupported` → Ohne-WebHID-Text, kein Verbinden-Button.
  - `error` → Meldung sichtbar und Button „Drucker verbinden“.
  - Dichte-Feld „Druckdichte (1–9)“ zeigt 4; Eingabe 6 + „Druckdichte speichern“ → `loadDensity()` → 6.
  - kein Feld „Breite (mm)“ mehr.
- [ ] **Step 2:** Tests → FAIL. **Step 3:** Implementieren; `main.tsx` erzeugt `createPrinterService()`; Abschnitt „Label“ samt `labelSettings`-Nutzung aus `SettingsPage` entfernen.
- [ ] **Step 4:** `npx vitest run` → PASS (bestehende Tests über `renderApp` mit Standard-`fakePrinter`).
- [ ] **Step 5: Commit** `feat: connect printer in settings`

### Task 7: Druck-Buttons auf Direktdruck umstellen

**Files:**
- Modify: `src/pages/ItemDetailPage.tsx`, `src/pages/ItemFormPage.tsx`, `src/lib/messages.ts`, zugehörige Tests

**Interfaces:**
- Consumes: Task 6 (`usePrinter`, `fakePrinter`, `renderApp`).
- Produces: `PRINT_FAILED` entfällt; neue Meldung im Formular: `` `Gespeichert, aber Drucken fehlgeschlagen: ${message}` ``.

Verhalten: „Label drucken“ und „Speichern & Label drucken“ aktiv nur bei `state.status === 'ready'`; während des eigenen Drucks Text `Druckt …` und deaktiviert; sonst deaktiviert mit Hinweis `Drucker in den Einstellungen verbinden` (Link auf `#/settings`), bei `unsupported` stattdessen der Ohne-WebHID-Text. Druckfehler auf der Detailseite als Fehlermeldung unter den Buttons.

- [ ] **Step 1: Failing tests**
  - Detail: Klick „Label drucken“ → `printer.print` mit dem `ItemView` (`id` gleich); `print` wirft `PrinterUserError('Der Deckel des Druckers ist offen.')` → Meldung sichtbar; Zustand `disconnected` → Button deaktiviert + Link „Drucker in den Einstellungen verbinden“.
  - Formular: „Speichern & Label drucken“ → Eintrag gespeichert und `print` aufgerufen; `print` wirft → `'Gespeichert, aber Drucken fehlgeschlagen: Der Deckel des Druckers ist offen.'`, Formular geleert, genau ein Eintrag; Zustand `unsupported` → Button deaktiviert, „Speichern“ funktioniert weiter.
  - bisherige Tests, die `printLabel` mocken, auf `fakePrinter` umstellen.
- [ ] **Step 2:** Tests → FAIL. **Step 3:** Implementieren. **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5: Commit** `feat: print labels directly from detail page and form`

### Task 8: Notlösung „Auf Papier drucken“

**Files:**
- Create: `src/print/printOnPaper.ts`, `src/print/printOnPaper.test.ts`
- Delete: `src/print/printLabel.tsx`, `src/print/printLabel.test.tsx`, `src/print/labelSettings.ts`, `src/print/labelSettings.test.ts`, `src/components/Label.tsx`, `src/components/Label.test.tsx`
- Modify: `src/pages/ItemDetailPage.tsx` (+ Test), `src/styles.css` (Abschnitt `/* Label */` entfernen; `@media print`-Regeln für `#print-root` behalten, Schnittlinie ergänzen)

**Interfaces:**
- Consumes: `drawLabel` (Task 3), `usePrinter` (Task 6).
- Produces: `PAPER_FALLBACK_SIZE: LabelSizeMm = { lengthMm: 40, widthMm: 30 }`; `paperPageCss(): string` → `'@page { size: A4; margin: 10mm }'`; `printOnPaper(item: ItemView, size: LabelSizeMm): Promise<void>` – zeichnet mit `drawLabel(…, 3)`, setzt das Bild (`canvas.toDataURL('image/png')`, `alt="Etikett"`, `width: <lengthMm>mm`, `height: <widthMm>mm`) mit Schnittlinie in einen Container `#print-root` samt `<style>` mit `paperPageCss()`, wartet auf `img.decode()` (falls vorhanden) und ruft `window.print()`. Der Container bleibt bis zum nächsten Aufruf bestehen (kein Aufräumen bei `afterprint`), der vorige wird beim nächsten Aufruf ersetzt.

- [ ] **Step 1: Failing tests**
  - `printOnPaper(item, { lengthMm: 40, widthMm: 30 })` → genau ein `#print-root`, darin `img[alt="Etikett"]` mit Stil `width: 40mm; height: 30mm`, `<style>` enthält `'@page { size: A4; margin: 10mm }'`, `window.print` einmal aufgerufen.
  - nach `afterprint` ist `#print-root` noch da; zweiter Aufruf → weiterhin genau ein `#print-root`.
  - Detailseite: Button „Auf Papier drucken“ aktiv auch bei Zustand `unsupported` und `disconnected`; Klick ruft `printOnPaper` (Modul-Mock) mit dem `ItemView` und `{ lengthMm: 40, widthMm: 30 }` bei `disconnected` bzw. der Rollen-Größe bei `ready` mit `media { lengthMm: 50, widthMm: 30 }`.
- [ ] **Step 2:** Tests → FAIL. **Step 3:** Implementieren; alte Dateien löschen. **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5: Commit** `feat: print a single label on plain paper as fallback`

### Task 9: Aufräumen, README

**Files:**
- Modify: `src/styles.css`, `README.md`

- [ ] **Step 1:** `grep -rn "labelSettings\|printLabel\|components/Label" src` → keine Treffer; ungenutztes CSS entfernen.
- [ ] **Step 2:** README, Abschnitt „3. Etikettendrucker“ ersetzen: Katasymbol/Supvan T50/T80 per USB; nur Chrome/Edge am PC; einmal unter Einstellungen › Drucker verbinden, danach automatisch; Katasymbol-App beim Drucken schließen; Etikettengröße kommt aus der Rolle; Druckdichte 1–9. Neuer Unterabschnitt „Notlösung: auf Papier drucken“ (Detailseite › „Auf Papier drucken“, A4, Ränder „Standard“, Skalierung 100 %, ausschneiden; geht auch am Handy). Checkliste „Manuelle Prüfung“: Druck 40 × 30, Kabel ziehen/stecken, Neuladen verbindet automatisch.
- [ ] **Step 3:** `npx vitest run` → PASS; `npx tsc --noEmit` → keine Fehler; `npm run build` → erfolgreich.
- [ ] **Step 4:** Manuell im Browser (Demo-Modus, simuliertes HID wie im Spike-Check): Einstellungen zeigen „Verbunden …“, Druck aus Detailseite läuft durch, gesendete Daten entpacken zu einem lesbaren Etikett; „Auf Papier drucken“ als PDF (A4) zeigt das Etikett 40 × 30 mm oben links mit Schnittlinie.
- [ ] **Step 5: Commit** `chore: clean up and document direct and paper printing`
