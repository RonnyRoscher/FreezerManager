# Bluetooth-Druck vom Android-Handy – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auf Android-Handys (Chrome) drucken die Druck-Buttons per Web Bluetooth direkt auf den Katasymbol T50M Pro; am PC bleibt USB.

**Architecture:** Die heutige `printerService.ts` wird in eine gemeinsame Druckjob-Funktion (`printJob.ts`), einen USB-Teil (`usbPrinter.ts`, Verhalten unverändert) und einen neuen Bluetooth-Teil (`bluetoothPrinter.ts`) aufgeteilt; `createPrinterService` wählt nach Browser-Fähigkeit. Die Oberfläche fragt nur `canPrint(state)` und nutzt `ensureConnected()` vor dem Speichern.

**Tech Stack:** React 18 + TypeScript, Vitest (jsdom, `canvas`), Web Bluetooth (`@types/web-bluetooth`), vendored `ble.ts` / `families/t5080-bt.ts`.

**Spec:** `docs/superpowers/specs/2026-11-20-bluetooth-printing-design.md`

## Global Constraints

- Verbindungsart: `navigator.hid` vorhanden → USB; sonst `navigator.bluetooth` vorhanden → Bluetooth; sonst `unsupported`. Kein Bluetooth am PC, kein iPhone.
- Vendored Code in `src/printer/vendor/` bleibt unverändert; Ergänzung nur in `devices.ts` (Bluetooth-Namenstabelle).
- Bluetooth-Treiber exakt: `new T5080BtDriver(transport, 384, { acksDataFrames: false, commandTimeoutMs: 4000 })`, danach `handshake()`; Transport `WebBluetoothTransport.request()` / `WebBluetoothTransport.open(device)` (Standard-Schreibmodus).
- Druckparameter wie USB: `paperDirection: 1`, `paperType`/`gap` aus der Rolle (Fallback 1/3), Dichte `loadDensity()`, `copies: 1`.
- Bluetooth hat keinen Zustand `error`; Fehler werden als `PrinterUserError` geworfen und von der Oberfläche angezeigt.
- Texte (exakt):
  - Ohne Direktdruck: `Direktdruck geht in Chrome oder Edge am PC (USB) und in Chrome auf Android-Handys (Bluetooth).`
  - Bluetooth aus: `Bluetooth ist ausgeschaltet. Bitte am Handy einschalten.`
  - Nicht erreichbar: `Drucker per Bluetooth nicht erreichbar. Ist er eingeschaltet und in der Nähe?`
  - Keine Antwort (Bluetooth): `Drucker antwortet nicht. Ist er eingeschaltet und in der Nähe?`
  - Fremdes Modell (Bluetooth): `Dieses Druckermodell wird nicht unterstützt.`
  - Formular, Auswahl abgebrochen: `Gespeichert, aber nicht gedruckt: kein Drucker ausgewählt.`
  - Einstellungen am Handy: `Per Bluetooth. Nach dem Öffnen der App beim ersten Druck den Drucker einmal auswählen.`
  - übrige Meldungen unverändert aus dem USB-Plan (`Drucker wurde getrennt.`, `Es wird bereits gedruckt.`, Gerätefehler …).

## Review Focus

1. App am Handy im Hintergrund → Bluetooth-Verbindung bricht ab → nächster Druck verbindet ohne Auswahlfenster neu und druckt (Test in Task 4).
2. Auswahlfenster abgebrochen auf der Detailseite → nichts passiert, keine Fehlermeldung (Test in Task 4 und Task 5).
3. „Speichern & Label drucken“ ohne Drucker → Auswahl öffnet sich vor dem Speichern (Test in Task 6).
4. Drucker beim erneuten Verbinden ausgeschaltet → Meldung „nicht erreichbar“, Zustand `disconnected` + `connectOnPrint`, nächster Tipp versucht es erneut (Test in Task 4).
5. Fremder Drucker gewählt (`T0999X…`) → „nicht unterstützt“, nicht gemerkt, nächster Tipp öffnet wieder die Auswahl (Test in Task 4).

---

### Task 1: Bluetooth-Namen der T50-Modelle

**Files:** Modify `src/printer/vendor/devices.ts`, `src/printer/vendor/devices.test.ts`, `src/printer/vendor/SOURCE.txt`

**Interfaces:**
- Produces: `bluetoothModelName(name: string | undefined): string | undefined` – sucht den Namensanfang in der übernommenen Tabelle `BT_NAME_PREFIXES` des Originals (`devices.ts` Z. 151–159 bei `fd7b53e`: T50M Pro, T50 Pro, A50 Pro; alle 384 Punkte); sonst `undefined`.

- [ ] **Step 1: Failing tests:** `bluetoothModelName('T0205C260729L704')` → `'T50M Pro'`; `('T0148B2507018663')` → `'T50M Pro'`; `('T0200A1')` → `'T50 Pro'`; `('T0999X123')` → `undefined`; `(undefined)` → `undefined`.
- [ ] **Step 2:** `npx vitest run src/printer/vendor/devices` → FAIL. **Step 3:** Tabelle (Präfixe wörtlich aus dem Original) und Funktion ergänzen; `SOURCE.txt` um eine Zeile ergänzen. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: recognize T50 printers by Bluetooth name`

### Task 2: Druckerverwaltung aufteilen, Zustand erweitern

**Files:**
- Create: `src/printer/printJob.ts`, `src/printer/printJob.test.ts`, `src/printer/usbPrinter.ts`
- Modify: `src/printer/printerService.ts` (nur noch Typen, Konstanten, `canPrint`, `createPrinterService`), `src/printer/printerService.test.ts` (USB-Tests auf neue Signatur), `src/test/fakePrinter.ts`, `src/main.tsx`, `src/components/PrinterHint.tsx`, `src/pages/SettingsPage.tsx`, Tests mit `{ status: 'disconnected' }` (`ItemDetailPage.test.tsx`, `SettingsPage.test.tsx`)

**Interfaces:**
- Produces (`printerService.ts`):
  - `PrinterState` wie bisher, aber `{ status: 'disconnected'; connectOnPrint: boolean }`.
  - `interface Printer` wie bisher plus `ensureConnected(): Promise<boolean>` (USB: `state.status === 'ready'`).
  - `canPrint(state: PrinterState): boolean` → `ready`, oder `disconnected` mit `connectOnPrint`.
  - `UNSUPPORTED_MESSAGE` = neuer Text aus Global Constraints.
  - `createPrinterService(apis: { hid?: HID; bluetooth?: Bluetooth } = { hid: navigator.hid, bluetooth: navigator.bluetooth }): Printer` → `createUsbPrinter(hid)` | `createBluetoothPrinter()` (Task 4; bis dahin `unsupported`) | unsupported-Stub.
- Produces (`printJob.ts`): `mediaSize(info: MediaInfo | null): MediaSize | null`; `printLabelJob(driver: Pick<PrinterDriver, 'readMedia' | 'print'>, item: ItemView): Promise<MediaSize>` – Rolle lesen (fehlt → `PrinterUserError('Etikettenrolle nicht erkannt.')`), `LabelSpec` bauen, `labelBitmap`, `driver.print(..., { density: loadDensity(), copies: 1 })`, gelesene Größe zurückgeben.
- Produces (`usbPrinter.ts`): `createUsbPrinter(hid: HID): Printer` – heutiges USB-Verhalten unverändert, nutzt `printLabelJob`; `disconnected` immer mit `connectOnPrint: false`.
- `fakePrinter` bekommt `ensureConnected: vi.fn(async () => true)`.

- [ ] **Step 1: Failing tests:**
  - `printJob.test.ts`: Treiber-Stub mit `readMedia` → `{ labelId: 5497, paperType: 1, lengthMm: 40, widthMm: 30, gap: 3, raw }` → `print` aufgerufen mit Bitmap 320 × 240, `LabelSpec` `{ lengthMm: 40, widthMm: 30, paperDirection: 1, paperType: 1, gap: 3 }`, Optionen `{ density: 4, copies: 1 }`; Rückgabe `{ lengthMm: 40, widthMm: 30 }`. `readMedia` mit Länge 0 → wirft `'Etikettenrolle nicht erkannt.'`, `print` nicht aufgerufen.
  - `printerService.test.ts`: `createPrinterService({})` → `{ status: 'unsupported' }`; `canPrint` für `ready` → true, `{ disconnected, connectOnPrint: true }` → true, `{ disconnected, connectOnPrint: false }` → false, `printing`/`error`/`unsupported` → false; bestehende USB-Tests mit `createPrinterService({ hid: fake.hid })` und erwarteten `{ status: 'disconnected', connectOnPrint: false }`; `ensureConnected()` bei `ready` → true, bei `disconnected` → false.
- [ ] **Step 2:** Tests → FAIL. **Step 3:** Aufteilen und anpassen (USB-Logik nur verschieben). **Step 4:** `npx vitest run` → PASS; `npx tsc --noEmit` sauber.
- [ ] **Step 5: Commit** `refactor: split printer service into USB part and shared print job`

### Task 3: Bluetooth-Fehlermeldungen

**Files:** Modify `src/printer/printerMessages.ts`, `src/printer/printerMessages.test.ts`

**Interfaces:**
- Produces: `isChooserCancelled(e: unknown): boolean` (DOMException `NotFoundError`, Meldung enthält `cancel`, Groß/Klein egal); `bluetoothErrorMessage(e: unknown): string` – Bluetooth aus (`NotFoundError` mit „adapter“ oder „not available“, oder `NotSupportedError`) → Bluetooth-aus-Text; `NetworkError` → Nicht-erreichbar-Text; `PrinterError` mit Code `timeout` → Bluetooth-Keine-Antwort-Text; sonst `printerErrorMessage(e)`.

- [ ] **Step 1: Failing tests:** `isChooserCancelled(new DOMException('User cancelled the requestDevice() chooser.', 'NotFoundError'))` → true; `(new DOMException('Bluetooth adapter not available.', 'NotFoundError'))` → false und `bluetoothErrorMessage` davon → Bluetooth-aus-Text; `new DOMException('GATT Server is disconnected.', 'NetworkError')` → Nicht-erreichbar-Text; `new PrinterError('Printer did not respond over Bluetooth', 'timeout')` → Bluetooth-Keine-Antwort-Text; `new PrinterError('Label cover is open', 'device')` → `'Der Deckel des Druckers ist offen.'`.
- [ ] **Step 2:** → FAIL. **Step 3:** Implementieren. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: German messages for Bluetooth printing errors`

### Task 4: Bluetooth-Druckerverwaltung

**Files:** Create `src/printer/bluetoothPrinter.ts`, `src/printer/bluetoothPrinter.test.ts`, `src/test/fakeBluetooth.ts`; Modify `src/printer/printerService.ts` (Bluetooth-Zweig einhängen)

**Interfaces:**
- Consumes: Task 1 (`bluetoothModelName`), Task 2 (`Printer`, `PrinterState`, `printLabelJob`, `mediaSize`), Task 3.
- Produces: `createBluetoothPrinter(): Printer` (nutzt `WebBluetoothTransport`, das `navigator.bluetooth` liest).
- `src/test/fakeBluetooth.ts`: `installFakeBluetooth(options?)` → `{ device, writes, commands(): number[], requestDevice: Mock, connect: Mock, dropConnection(), uninstall() }`; setzt `navigator.bluetooth` (über `Object.defineProperty`, `configurable: true`). Optionen: `name` (Standard `'T0205C260729L704'`), `status` (8 Bytes, ab Antwortbyte 14), `media` (`{ paperType, lengthMm, widthMm, gap }` an Antwortbytes 39–42, Etikett-ID 5497 an 37/38), `cancel` (requestDevice wirft `NotFoundError` „User cancelled the requestDevice() chooser.“), `bluetoothOff`, `connectFails` (gatt.connect wirft `NetworkError`), `silent`. Antwortlogik wie im Spike-Check: auf jeden Befehlsrahmen (`7E 5A 0C`, Befehl an Byte 7) 64-Byte-Antwort `7E 5A 3C 00 …` nach 5 ms; nach `START_PRINT` (0x13) sechs Statusantworten mit „druckt“-Bit (Byte 16 `|= 0x40`). `dropConnection()` löst `gattserverdisconnected` aus und setzt `gatt.connected = false`.

Verhalten (aus der Spec):
- Start → `{ status: 'disconnected', connectOnPrint: true }`; `init()` tut nichts.
- `connect()`: `WebBluetoothTransport.request()`; abgebrochen → kein Fehler, Zustand unverändert; Name nicht in Tabelle → wirft `Dieses Druckermodell wird nicht unterstützt.`, Gerät nicht gemerkt; sonst öffnen, Treiber, `handshake()`, `readMedia()` → `ready` mit Modell und Rolle; Gerät gemerkt; `gattserverdisconnected` → `disconnected` (connectOnPrint), Treiber verworfen.
- `ensureConnected()`: `ready` → true; gemerktes Gerät → neu öffnen ohne Auswahl → true; sonst wie `connect()`; abgebrochen → false; Fehler → wirft mit `bluetoothErrorMessage`, Zustand `disconnected` (connectOnPrint), Gerät bleibt gemerkt.
- `print(item)`: läuft schon → `Es wird bereits gedruckt.`; `ensureConnected()` false → ohne Fehler zurück; `printLabelJob`; danach `ready` mit frischer Rolle; Fehler → `bluetoothErrorMessage` bzw. `Drucker wurde getrennt.` bei Abbruch während des Drucks; Zustand danach `ready` falls verbunden, sonst `disconnected`.
- `disconnect()`: Transport schließen, `device.forget?.()`, Gerät vergessen → `disconnected`.

- [ ] **Step 1: Failing tests** (`bluetoothPrinter.test.ts`, mit `installFakeBluetooth`; `afterEach` → `uninstall()`):
  - `createPrinterService({ bluetooth: navigator.bluetooth })` ohne `hid` → Bluetooth: Zustand `{ status: 'disconnected', connectOnPrint: true }`.
  - `connect()` → `{ status: 'ready', model: 'T50M Pro', media: { lengthMm: 40, widthMm: 30 } }`.
  - `print(item)` ohne vorheriges Verbinden → `requestDevice` einmal, Befehle enthalten in Reihenfolge `0x11, 0x30, 0x12, 0x13, 0x5c, 0x10`, Zustand `ready`.
  - zweiter `print` → `requestDevice` weiterhin nur einmal (Verbindung offen).
  - `dropConnection()` → `disconnected` (connectOnPrint); `print` → kein weiterer `requestDevice`, `connect` (gatt) erneut aufgerufen, gedruckt (Review Focus 1).
  - `cancel` → `print` löst ohne Fehler auf, keine Druckbefehle (Review Focus 2); `ensureConnected()` → false.
  - `connectFails` beim Neuverbinden → `print` wirft Nicht-erreichbar-Text, Zustand `disconnected` + connectOnPrint; ohne `connectFails` danach druckt der nächste `print` ohne Auswahl (Review Focus 4).
  - `name: 'T0999X123'` → `connect()` wirft `'Dieses Druckermodell wird nicht unterstützt.'`; nächster `print` öffnet erneut die Auswahl (Review Focus 5).
  - Deckel offen (`status: [0,0,0x08,0,0,0,0,0]`) → `print` wirft `'Der Deckel des Druckers ist offen.'`, Zustand `ready`.
  - `silent` (Fake-Timer, `shouldAdvanceTime: true`) → `connect()` wirft Bluetooth-Keine-Antwort-Text.
  - zwei `print` gleichzeitig → zweiter wirft `'Es wird bereits gedruckt.'`, `0x13` genau einmal.
  - `dropConnection()` während des Drucks (nach `0x13`) → wirft `'Drucker wurde getrennt.'`, Zustand `disconnected`.
  - `disconnect()` → `disconnected`; nächster `print` öffnet die Auswahl.
- [ ] **Step 2:** → FAIL. **Step 3:** Implementieren; in `createPrinterService` einhängen. **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5: Commit** `feat: print over Bluetooth on Android`

### Task 5: Oberfläche: Detailseite und Einstellungen

**Files:** Modify `src/components/PrinterHint.tsx`, `src/pages/ItemDetailPage.tsx`, `src/pages/SettingsPage.tsx` + Tests

**Interfaces:** Consumes `canPrint`, `PrinterState` (Task 2), `fakePrinter` (`ensureConnected`).

Verhalten: „Label drucken“ aktiv bei `canPrint(state)`; `PrinterHint` zeigt nichts bei `canPrint` oder `printing`. Einstellungen: bei `disconnected` + `connectOnPrint` zusätzlich den Bluetooth-Hinweistext; `connect()`-Fehler (geworfen) als Fehlermeldung im Abschnitt anzeigen.

- [ ] **Step 1: Failing tests:**
  - Detail: Zustand `{ disconnected, connectOnPrint: true }` → „Label drucken“ aktiv, kein Link „Drucker in den Einstellungen verbinden“, Klick ruft `print`; `print` löst ohne Fehler auf → keine Fehlermeldung (Review Focus 2).
  - Detail: `{ disconnected, connectOnPrint: false }` → deaktiviert + Link (wie bisher).
  - Einstellungen: `{ disconnected, connectOnPrint: true }` → Text „Nicht verbunden“, Bluetooth-Hinweistext, Button „Drucker verbinden“; `connect` wirft `PrinterUserError('Dieses Druckermodell wird nicht unterstützt.')` → Meldung sichtbar.
  - `unsupported` → neuer Ohne-Direktdruck-Text (Einstellungen und Detail).
- [ ] **Step 2:** → FAIL. **Step 3:** Implementieren. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: enable printing over Bluetooth in detail page and settings`

### Task 6: „Speichern & Label drucken“ verbindet zuerst

**Files:** Modify `src/pages/ItemFormPage.tsx`, `src/pages/ItemFormPage.test.tsx`

Verhalten: Button aktiv bei `canPrint(state)`. Beim Klick mit Druck: zuerst `ensureConnected()` (Fehler merken, `false` = abgebrochen), dann speichern wie bisher, dann – nur wenn verbunden – `print(view)`. Meldungen: abgebrochen → `Gespeichert, aber nicht gedruckt: kein Drucker ausgewählt.`; Verbindungsfehler → `Gespeichert, aber Drucken fehlgeschlagen: <Meldung>`. Speichern schlägt fehl → wie bisher, kein Druck.

- [ ] **Step 1: Failing tests** (`fakePrinter({ status: 'disconnected', connectOnPrint: true })`):
  - Button aktiv; Klick → `ensureConnected` vor `createItem` aufgerufen (Aufrufreihenfolge über `mock.invocationCallOrder` mit einem Repo-Spy) und danach `print` mit dem neuen Eintrag (Review Focus 3).
  - `ensureConnected` → false → Eintrag gespeichert, `print` nicht aufgerufen, Meldung `Gespeichert, aber nicht gedruckt: kein Drucker ausgewählt.`
  - `ensureConnected` wirft `PrinterUserError('Drucker per Bluetooth nicht erreichbar. Ist er eingeschaltet und in der Nähe?')` → gespeichert, Meldung `Gespeichert, aber Drucken fehlgeschlagen: Drucker per Bluetooth nicht erreichbar. Ist er eingeschaltet und in der Nähe?`
- [ ] **Step 2:** → FAIL. **Step 3:** Implementieren. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: connect the printer before saving when printing from the form`

### Task 7: Kurzcode-Schrift

**Files:** Modify `src/printer/labelBitmap.ts`, `src/printer/labelBitmap.test.ts`

- [ ] **Step 1: Failing test:** `drawLabel` auf einem Canvas, dessen `fillText` über einen Spy die jeweils gesetzte `ctx.font` aufzeichnet: der Aufruf mit dem Kurzcode (`'K7F3'`) nutzt eine Schrift, die `Arial` enthält und `bold` ist, und nicht `Courier`.
- [ ] **Step 2:** → FAIL. **Step 3:** Kurzcode mit `bold ${fontPx.body}px Arial, Helvetica, sans-serif`. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `fix: print the short code in a font Android has`

### Task 8: Aufräumen, README, Prüfung im Browser

**Files:** Delete `druck-test-bt.html`, `src/spike/`; Modify `vite.config.ts` (Build-Eintrag `drucktestbt` und `navigateFallbackDenylist` entfernen), `README.md`

- [ ] **Step 1:** Dateien löschen, `vite.config.ts` zurückbauen; `grep -rn "spike\|druck-test" src vite.config.ts` → keine Treffer.
- [ ] **Step 2:** README, Abschnitt Etikettendrucker: Unterabschnitt „Am Android-Handy per Bluetooth“ (Chrome, Bluetooth und ggf. Standort an, beim ersten Druck nach dem Öffnen den Drucker „T0…“ wählen, Katasymbol-App schließen, nicht gleichzeitig per USB am PC; iPhone: nur „Auf Papier drucken“). Checkliste: Druck am Handy nach App-Start, zweiter Druck ohne Auswahl, Drucker aus/an und erneut drucken.
- [ ] **Step 3:** `npx vitest run` → PASS; `npx tsc --noEmit` sauber; `npm run build` → erfolgreich, kein `druck-test-bt.html` in `dist/`.
- [ ] **Step 4:** Manuell im Browser (Demo-Modus, simuliertes Bluetooth wie im Spike-Check, ohne `navigator.hid`): Detailseite „Label drucken“ → Auswahl (Fake), Druck läuft durch, gesendete Daten entpacken zu einem lesbaren Etikett mit serifenlosem Kurzcode.
- [ ] **Step 5: Commit** `chore: remove Bluetooth spike, document Bluetooth printing`
