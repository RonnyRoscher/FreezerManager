# Etikettendruck per Bluetooth vom Android-Handy – Design

Datum: 2026-11-20

## Warum

Der Direktdruck per USB (siehe `2026-11-20-direct-label-printing-design.md`) geht nur am PC.
Am Handy gibt es für Webseiten keinen passenden USB-Zugang (Android: kein WebHID, WebUSB darf
HID-Geräte nicht ansprechen; iPhone: gar kein USB). Der Haushalt nutzt Android. Der Drucker
(Katasymbol T50M Pro) hat Bluetooth.

Ein Wegwerf-Test (`druck-test-bt.html`, 2026-11-20) hat am echten Gerät funktioniert: Chrome
auf Android, Web Bluetooth, Testetikett 40 × 30 mm in 3,8 s sauber gedruckt. Der Drucker meldete:

- Bluetooth-Name `T0205C260729L704`, GATT-Dienst `0000e0ff-3c17-d293-8e48-14fe2e4da212`,
  Schreiben auf `ffe9` (write + write without response; genutzt: write), Antworten per Notify
  auf `ffe1`
- Rolle wie per USB: ID 5497, Typ 1, 40 × 30 mm, Lücke 3; Akku 4,07 V (4/4)
- Treiber: `T5080BtDriver(transport, 384, { acksDataFrames: false, commandTimeoutMs: 4000 })`,
  `handshake()` vor dem ersten Befehl

## Ziele

- Am Android-Handy (Chrome, auch als installierte App) drucken „Label drucken“ und
  „Speichern & Label drucken“ per Bluetooth direkt auf den Etikettendrucker.
- Am PC bleibt alles wie bisher (USB).
- Die App wählt die Verbindungsart selbst; der Nutzer muss nichts einstellen.

## Nicht-Ziele

- Bluetooth am PC (Weg 2, vom Nutzer nicht gewählt).
- iPhone (Safari hat kein Web Bluetooth).
- Akkustand-Anzeige, Firmware-Infos, andere Druckerfamilien.

## Anti-Ziele

- Ein „Fertig“, obwohl nichts gedruckt wurde.
- Ein Druck-Button, der am Handy nichts tut und keinen Grund nennt.

## Ansätze

1. **Handy per Bluetooth, PC per USB** – *gewählt.* Verbindungsart nach Browser-Fähigkeit:
   WebHID vorhanden → USB; sonst Web Bluetooth vorhanden → Bluetooth; sonst kein Direktdruck.
2. **Bluetooth zusätzlich am PC** – mehr Oberfläche, gleiche Neustart-Einschränkung am PC;
   nicht gewählt.

## Rahmenbedingungen

- Chrome merkt sich Bluetooth-Geräte nicht über einen Neustart der App (`getDevices()` für
  Web Bluetooth ist nicht allgemein verfügbar). Nach jedem App-Start muss der Drucker einmal im
  Auswahlfenster gewählt werden; das Auswahlfenster braucht einen Tipp des Nutzers.
- Ein Bluetooth-Gerät kann nur mit einem Gerät gleichzeitig verbunden sein (Katasymbol-App
  schließen, USB-Verbindung am PC trennen).
- Übernommener Code (MIT, khromov/supvan-katasymbol-printer-web-ui, Commit `fd7b53e`):
  `ble.ts`, `serial.ts`, `families/t5080-bt.ts` liegen bereits unverändert in
  `src/printer/vendor/`. Zusätzlich aus `devices.ts` des Originals die Bluetooth-Namenstabellen
  und `modelNameFromBluetoothName` / `familyFromBluetoothName` (für Modellname und um andere
  Familien abzulehnen).

## Entwurf

### Verbindungsart

`createPrinterService` bekommt beide Browser-Schnittstellen und entscheidet beim Erzeugen:
`navigator.hid` vorhanden → USB-Verhalten wie heute (unverändert); sonst `navigator.bluetooth`
vorhanden → Bluetooth-Verhalten; sonst `unsupported`. Der Zustand verrät die Verbindungsart nicht
nach außen; nur ein neues Feld im Zustand `disconnected` sagt der Oberfläche, ob ein Druck selbst
verbinden darf (siehe unten).

### Bluetooth-Verhalten

- **Start:** Zustand `disconnected` (kein automatisches Verbinden möglich).
- **Verbinden** (Einstellungen › „Drucker verbinden“, oder automatisch beim ersten Druck):
  Auswahlfenster mit Filter Namensanfang `T0` und den Diensten aus `ble.ts`; Gerät verbinden,
  `handshake()`, Rolle lesen → `ready` mit Modellname und Rolle.
  - Modellname nur aus der T50/T80-Bluetooth-Namenstabelle des Originals (`BT_NAME_PREFIXES`:
    T50M Pro, T50 Pro, A50 Pro – alle mit 384-Punkte-Druckkopf; `T0205…` → „T50M Pro“). Jeder
    andere Name (andere Familie, unbekanntes Präfix, T80 mit 576 Punkten) → Meldung
    „Dieses Druckermodell wird nicht unterstützt.“, Gerät wird nicht gemerkt. So wird nie mit
    falscher Druckkopfbreite gedruckt. *(Meine Entscheidung.)*
- **Verbindung bleibt offen**, solange die App läuft (anders als USB): ein erneutes Verbinden
  kostet Zeit, und andere Programme stört die Verbindung am Handy nicht. Bricht sie ab
  (Drucker aus, außer Reichweite, App im Hintergrund) → Zustand `disconnected`; das
  `BluetoothDevice` wird gemerkt.
- **Drucken:**
  - Zustand `ready` → direkt drucken.
  - Zustand `disconnected` mit gemerktem Gerät → ohne Auswahlfenster neu verbinden
    (`device.gatt.connect()`), dann drucken.
  - Zustand `disconnected` ohne gemerktes Gerät → Auswahlfenster öffnen (der Tipp auf den
    Druck-Button ist die nötige Nutzergeste), verbinden, drucken. Bricht der Nutzer die Auswahl
    ab → kein Druck, keine Fehlermeldung.
  - Rolle vor jedem Druck neu lesen; Druck wie im Spike (`paperDirection: 1`, `paperType`/`gap`
    aus der Rolle, Dichte aus den Einstellungen, `copies: 1`); nur ein Druck gleichzeitig.
- **Trennen:** Verbindung schließen, gemerktes Gerät vergessen (`device.forget()`, falls
  vorhanden) → `disconnected`. Das ist auch der Weg, einen anderen Drucker zu wählen.
- **Nach Fehlern:** Bei Bluetooth gibt es keinen Zustand `error`. Jeder Fehler beim Verbinden
  oder Drucken (nicht erreichbar, Zeitüberschreitung, Abbruch, Gerätefehler) erscheint als
  Meldung beim Button bzw. in den Einstellungen; der Zustand ist danach `ready` (Verbindung
  steht noch) oder `disconnected` mit `connectOnPrint`, damit der nächste Tipp es einfach
  erneut versucht. Das gemerkte Gerät bleibt erhalten (außer bei „nicht unterstützt“).
  *(Meine Entscheidung.)*

### „Speichern & Label drucken“ ohne verbundenen Drucker

Das Auswahlfenster braucht einen frischen Tipp; nach einem langsamen Speichern über mobile
Daten würde Chrome es verweigern. Deshalb: zuerst verbinden (Auswahlfenster nur, wenn kein
Gerät gemerkt ist), dann speichern, dann drucken. Bricht der Nutzer die Auswahl ab oder
schlägt das Verbinden fehl, wird trotzdem gespeichert, mit der Meldung
„Gespeichert, aber nicht gedruckt: kein Drucker ausgewählt.“ bzw. „Gespeichert, aber Drucken
fehlgeschlagen: <Grund>“. Dafür bekommt die `Printer`-Schnittstelle
`ensureConnected(): Promise<boolean>` (`false` = Auswahl abgebrochen; bei USB: `true`, wenn
`ready`). *(Meine Entscheidung.)*

### Zustand und Oberfläche

- `PrinterState` `disconnected` erhält das Feld `connectOnPrint: boolean` (Bluetooth: `true`,
  USB: `false`).
- Druck-Buttons sind aktiv bei `ready` oder bei `disconnected` mit `connectOnPrint`. Bei
  `connectOnPrint` kein Hinweis „Drucker in den Einstellungen verbinden“.
- Einstellungen › Drucker am Handy: wie am PC („Drucker verbinden“ / „Trennen“, Anzeige
  „Verbunden: T50M Pro · Etikett 40 × 30 mm“, Dichte) plus Hinweis
  „Per Bluetooth. Nach dem Öffnen der App beim ersten Druck den Drucker einmal auswählen.“
- Ohne USB und ohne Bluetooth (z. B. iPhone, Firefox): Text ändert sich zu
  „Direktdruck geht in Chrome oder Edge am PC (USB) und in Chrome auf Android-Handys
  (Bluetooth).“ „Auf Papier drucken“ bleibt wie bisher immer verfügbar.

### Fehlermeldungen (Bluetooth)

- Auswahl abgebrochen → keine Meldung.
- Bluetooth am Handy aus / nicht verfügbar → „Bluetooth ist ausgeschaltet. Bitte am Handy
  einschalten.“
- Verbinden fehlgeschlagen → „Drucker per Bluetooth nicht erreichbar. Ist er eingeschaltet und
  in der Nähe?“
- Keine Antwort (Treiber-Zeitüberschreitung) → „Drucker antwortet nicht. Ist er eingeschaltet
  und in der Nähe?“ (USB behält seinen Text)
- Verbindung bricht während des Drucks ab → „Drucker wurde getrennt.“
- Gerätefehler (Deckel, Rolle, Akku leer …) wie bei USB. Die Warnung „Akku schwach“ blockiert
  nicht und wird nicht angezeigt (Akku-Anzeige ist Nicht-Ziel). *(Meine Entscheidung.)*

### Etikett

- Kurzcode in fetter serifenloser Schrift statt `'Courier New', monospace` (auf Android fehlt
  Courier New; der Testdruck zeigte eine Serifenschrift). Gilt für USB, Bluetooth und Papier.

### Tests

- Simuliertes Bluetooth-Gerät (`src/test/fakeBluetooth.ts`, nach dem Muster aus dem Spike-Check:
  Antwort-Frames `7E 5A`, Befehl an Byte 7, Statusbytes ab 14, Rolle ab 37).
- Service: Wahl der Verbindungsart; Verbinden über Auswahl; Druck aus `disconnected` mit und
  ohne gemerktes Gerät; Auswahl abgebrochen; Abbruch der Verbindung → `disconnected` →
  nächster Druck verbindet neu; Deckel offen; Zeitüberschreitung; zwei Drucke gleichzeitig;
  fremde Familie abgelehnt; Trennen.
- Seiten: Druck-Buttons aktiv bei `disconnected` + `connectOnPrint`, kein Einstellungs-Hinweis;
  neuer Ohne-Direktdruck-Text.
- Etikett: Kurzcode-Schrift (Test über `drawLabel` mit gespyten `ctx.font`-Werten oder über die
  Font-Konstante).
- Manuell am Handy: Druck nach App-Start (Auswahl), zweiter Druck ohne Auswahl, Drucker aus-
  und einschalten, dann drucken.

### Aufräumen

- Entfernen: `druck-test-bt.html`, `src/spike/`, Build-Eintrag, Workbox-Ausnahme.
- README: Abschnitt Etikettendrucker um „Am Android-Handy per Bluetooth“ ergänzen.

## Dem Umsetzenden überlassen

- Ob USB- und Bluetooth-Verhalten in einer Datei oder in zwei Hilfsmodulen hinter derselben
  `Printer`-Schnittstelle liegen.
- Genaue Formulierung kleiner Hinweistexte.
