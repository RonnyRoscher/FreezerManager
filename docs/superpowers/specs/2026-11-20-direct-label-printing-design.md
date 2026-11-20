# Direktdruck auf den Etikettendrucker – Design

Datum: 2026-11-20

## Warum

Der Druck über den Browser-Druckdialog funktioniert mit dem Etikettendrucker des Haushalts
(Katasymbol T50M Pro, unter Windows „Supvan_T50_Printer“) nicht: Der Windows-Treiber bietet
nur große Papierformate („Output Area“, „User defined size“) und merkt sich ein eigenes
40 × 30 mm-Format nicht. Chrome verkleinert das Etikett auf dieses große Blatt, gedruckt wird
ein leeres Etikett.

Ein Wegwerf-Test (`druck-test.html`, 2026-11-20) hat gezeigt, dass die App den Drucker direkt
per USB (WebHID) ansprechen kann: Das Testetikett kam vollständig, scharf und richtig
ausgerichtet heraus. Der Drucker meldete dabei:

- USB `vendorId 0x1820`, `productId 0x207f`, `productName "USB Device"`, HID-Collection
  `usagePage 0xff00`
- Rolle: Etikett-ID 5497, Typ 1 (gestanzt), Länge 40 mm, Breite 30 mm, Lücke 3 mm
- Druck mit 4096-Byte-Puffern (kein T50M-40000-Byte-Modus), Ausrichtung 1, Dichte 4

## Ziele

- „Label drucken“ (Detailseite) und „Speichern & Label drucken“ (Einfrieren) senden das
  Etikett ohne Druckdialog direkt an den Drucker.
- Der Drucker wird einmal verbunden; danach verbindet die App sich bei jedem Start selbst.
- Die Etikettengröße kommt aus dem Drucker (eingelegte Rolle), nicht aus einer Einstellung.
- Etiketten bleiben inhaltlich wie bisher: QR-Code, Name, Menge · Details, Kategorie,
  Einfrierdatum, Ort, Kurzcode.

## Nicht-Ziele

- Bluetooth (später als Erweiterung; die Architektur muss es zulassen, gebaut wird es jetzt nicht).
- Andere Druckerfamilien als Supvan/Katasymbol T50/T80.
- Mehrere Kopien, Etiketten-Designer, Druckvorschau-Editor.

## Anti-Ziele

- Ein Druck, der „Fertig“ meldet, obwohl nichts oder etwas Falsches gedruckt wurde.
- Ein halb abgebrochener Druckauftrag, der den Drucker blockiert.

## Rahmenbedingungen

- **Nur Direktdruck.** Der bisherige Weg über `window.print()` (`src/print/printLabel.tsx`,
  `src/components/Label.tsx`, Labelgröße in den Einstellungen, `fm.labelSize`, Druck-CSS)
  wird entfernt. Ohne verbundenen Drucker kann nicht gedruckt werden (vom Nutzer so gewählt).
- WebHID gibt es nur in Chromium-Browsern am Desktop (Chrome, Edge). Am Handy und in
  Firefox/Safari gibt es keinen Druck; die Druck-Buttons sind dort deaktiviert mit Hinweis.
- Druckerprotokoll: übernommen aus
  [khromov/supvan-katasymbol-printer-web-ui](https://github.com/khromov/supvan-katasymbol-printer-web-ui)
  (MIT, Commit `fd7b53e`), wie bereits in `src/spike/printer/` – inklusive `lzma.js` (MIT,
  von Supvan angepasste Einstellungen, nicht durch Standard-LZMA ersetzen). Lizenzdatei bleibt
  beigelegt.

## Ansätze

1. **Direktdruck als Standard, Browser-Druck als Ausweichweg** – druckt auch ohne Drucker
   (PDF, andere Drucker), dafür zwei Druckwege zu pflegen.
2. **Nur Direktdruck** – *gewählt.* Ein Druckweg, weniger Code; ohne verbundenen Drucker
   (Handy, anderer Browser) kein Druck.

Für das Zeichnen des Etiketts: direkt auf ein Canvas in Druckerauflösung (8 Punkte/mm,
schwarz/weiß) statt HTML in ein Bild umzuwandeln – scharfe Kanten, keine Abhängigkeit von
Browser-Layout. (Meine Entscheidung.)

## Entwurf

### Bausteine

- **`src/printer/vendor/`** – übernommener Druckercode (Transport-Schnittstelle, WebHID-Transport,
  Befehlskanal, Bitmap-Hilfen, T50/T80-Treiber, LZMA, Typen) + Lizenz + Herkunft. Inhaltlich
  unverändert gegenüber `src/spike/printer/`, damit Updates aus dem Original nachvollziehbar
  bleiben. Zusätzlich wird die Gerätetabelle des Originals (`devices.ts`, gleicher Commit)
  übernommen, beschränkt auf die Familie `t5080` (Produkt-IDs → Modellname, Druckkopf-Punkte).
  Sie entscheidet, welche Geräte unterstützt werden, und liefert den Anzeigenamen, weil der
  Drucker sich selbst nur als „USB Device“ meldet. *(Meine Entscheidung.)* Der Transport ist bereits eine Schnittstelle; Bluetooth kann später als weiterer
  Transport (Original: `ble.ts`, `families/t5080-bt.ts`) dazukommen.
- **`src/printer/labelBitmap.ts`** – zeichnet ein Etikett für ein `ItemView` auf ein Canvas in
  `lengthMm × widthMm` mm bei 8 Punkten/mm und liefert die Bitmap (Schwelle wie im Original,
  `rgbaToBitmap`). Layout wie das bisherige HTML-Label:
  - 1 mm Rand; QR-Code links, Kantenlänge `min(Höhe − 2 mm, 45 % der Breite)`, vertikal zentriert.
  - Rechts: Name fett, Menge · Details, Kategorie, Einfrierdatum `TT.MM.JJJJ`, Ort
    „Gerät › Fach“, Kurzcode fett in Festbreitenschrift.
  - Name und Ort dürfen auf zwei Zeilen umbrechen (an Wortgrenzen; zu lange Wörter hart
    umbrechen), danach mit „…“ kürzen; die übrigen Zeilen einzeilig mit „…“.
  - Schriftgrößen relativ zur Etikettenhöhe, sodass 40 × 30 mm so aussieht wie der freigegebene
    Testdruck und andere Größen (z. B. 50 × 30, 62 × 29) proportional funktionieren.
  - QR-Inhalt wie bisher: `buildTakeUrl(appBaseUrl(), item.id)`.
- **`src/printer/PrinterContext.tsx`** – Verbindungsverwaltung für die ganze App:
  - Zustand: `unsupported` (kein WebHID) · `disconnected` · `connecting` · `ready`
    (mit Modellname, Etikett laut Drucker oder „Rolle nicht erkannt“) · `printing` ·
    `error` (mit Meldung).
  - `error` steht nur für Verbindungsprobleme (Öffnen fehlgeschlagen, unbekanntes Modell).
    Ein fehlgeschlagener Druck (Deckel offen, Rolle leer, Zeitüberschreitung) ändert den
    Zustand nicht: Die Meldung erscheint beim Druck-Button, der Zustand bleibt `ready`, und der
    nächste Druck prüft den Druckerstatus ohnehin neu. Nur wenn das Gerät dabei verschwindet,
    wird der Zustand `disconnected`. *(Meine Entscheidung.)*
  - Das USB-Gerät wird nur für die Dauer eines Gesprächs mit dem Drucker geöffnet (Status
    und Rolle lesen beim Verbinden/Start, ein Druckauftrag) und danach wieder geschlossen.
    So kann die Katasymbol-App den Drucker weiter nutzen, und mehrere Tabs/Fenster
    stören sich nicht dauerhaft. „Verbunden“ heißt: Freigabe erteilt und Gerät angesteckt.
    Ist das Gerät beim automatischen Verbinden belegt, bleibt der Zustand `ready` mit
    „Rolle nicht erkannt“; erst ein Druck meldet „belegt“. *(Meine Entscheidung.)*
  - `connect()`: `navigator.hid.requestDevice({ filters: [{ vendorId: 0x1820 }] })`, Gerät mit
    `usagePage 0xff00` bevorzugen, öffnen, Status und Rolle lesen.
  - Beim App-Start: `navigator.hid.getDevices()` – bereits freigegebener Drucker wird ohne
    Klick verbunden. `connect`/`disconnect`-Ereignisse von `navigator.hid` (Kabel ab/an)
    aktualisieren den Zustand.
  - `print(item)`: Rolle lesen (`readMedia`), Bitmap zeichnen, `driver.print(...)` mit
    `copies: 1`, Dichte aus den Einstellungen, `paperDirection: 1`, `paperType` aus der Rolle.
    Nur ein Druck gleichzeitig.
  - Treiberwahl: `T5080Driver` für Produkt-IDs der Familie `t5080` aus der Gerätetabelle
    (Druckkopf-Punkte aus der Tabelle); jede andere Supvan-Produkt-ID → Zustand `error`
    „Dieses Druckermodell wird nicht unterstützt (USB-ID 0x…).“
- **Einstellungen › Drucker** (ersetzt Abschnitt „Label“):
  - Zustand („Verbunden: Supvan T50M Pro · Etikett 40 × 30 mm“ / „Nicht verbunden“),
    Buttons „Drucker verbinden“ / „Trennen“.
  - Dichte 1–9 (Standard 4), gespeichert in `localStorage` (`fm.printDensity`).
  - Ohne WebHID: Hinweis „Drucken geht nur in Chrome oder Edge am PC mit per USB
    angeschlossenem Drucker.“
- **Druck-Buttons** (Detailseite, Formular):
  - Aktiv nur bei Zustand `ready`; sonst deaktiviert mit kurzem Hinweis und Link zu den
    Einstellungen („Drucker in den Einstellungen verbinden“).
  - Während des Drucks: Button deaktiviert, Text „Druckt …“.
  - „Speichern & Label drucken“ speichert immer; Druckfehler zeigen wie bisher „Gespeichert,
    aber Drucken fehlgeschlagen.“ plus Grund.

### Fehlerbehandlung

Meldungen auf Deutsch, aus den Treiberfehlern abgeleitet:

- Drucker meldet Fehler (Deckel offen, keine/falsche Rolle, leer, Druckkopf zu heiß) →
  entsprechende deutsche Meldung, kein Druck.
- Keine Antwort / Zeitüberschreitung → „Drucker antwortet nicht. Ist er eingeschaltet und
  per USB verbunden?“
- Drucker wird während des Drucks getrennt → Fehlermeldung, Zustand `disconnected`.
- Rolle nicht lesbar oder Größe 0 → „Etikettenrolle nicht erkannt.“, kein Druck.
- Gerät von einem anderen Programm belegt (Öffnen schlägt fehl) → „Drucker ist von einem
  anderen Programm belegt (z. B. Katasymbol-App).“
- Bei jedem Fehler während eines Auftrags ruft der Treiber bereits `stop()` auf (Anti-Ziel).

### Tests

- `labelBitmap`: Größe in Punkten (40 × 30 → 320 × 240), QR-Bereich schwarz, Textbereich
  enthält Pixel, Zeilenumbruch-/Kürzungslogik als reine Funktion getestet.
- `PrinterContext`/Druckablauf mit einem simulierten HID-Gerät (wie im Spike): gesendete
  Befehlsfolge, Fehlerzustände (Deckel offen, Timeout, getrennt), nur ein Druck gleichzeitig,
  automatische Verbindung über `getDevices()`.
- Seiten: Druck-Buttons deaktiviert ohne Drucker, Hinweistext; „Speichern & Label drucken“
  speichert auch bei Druckfehler.
- Übernommener Druckercode: keine eigenen Unit-Tests über den Spike-Nachweis hinaus; ein Test
  prüft, dass die gesendeten LZMA-Daten sich zu gültigen Puffern mit korrekter Prüfsumme
  entpacken lassen (wie im Spike-Check).
- Manuell: Druck am echten Drucker (40 × 30), Kabel ziehen/stecken, Neuladen verbindet
  automatisch.

### Aufräumen

- Entfernen: `druck-test.html`, `src/spike/`, Build-Eintrag `drucktest`, Workbox-Ausnahme,
  `src/print/` (Browser-Druck, Labelgröße), `src/components/Label.tsx` samt Tests, Druck-CSS
  in `styles.css`.
- README: Abschnitt „Etikettendrucker“ neu (USB, Chrome/Edge, einmal verbinden, Katasymbol-App
  schließen, Dichte), Hinweis, dass am Handy nicht gedruckt wird.

## Dem Umsetzenden überlassen

- Genaue Schriftgrößen und Abstände, solange 40 × 30 mm gut lesbar ist (Vergleich mit dem
  Testdruck).
- Ob die Verbindungsverwaltung ein React-Context oder ein kleiner Store ist.
- Texte der Hinweise im Detail.
