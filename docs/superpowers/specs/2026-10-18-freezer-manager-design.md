# FreezerManager – Design

Datum: 2026-10-18

## Ziel

Eine kleine App für den eigenen Haushalt, mit der Inhalt und Ort von Lebensmitteln
in Gefriergeräten verwaltet werden. Einfrieren und Label-Druck erfolgen typischerweise
am PC, das Austragen per QR-Scan am Handy. Eine Übersicht zeigt, was noch vorhanden
ist, wo es liegt und wie alt es ist.

### Erfolgskriterien

- Ein Lebensmittel lässt sich in unter einer Minute erfassen und als Label drucken.
- Austragen am Handy: QR-Code scannen, „Entnehmen“ tippen – fertig.
- PC und Handy sehen denselben, aktuellen Bestand.
- Die Übersicht beantwortet „Was habe ich, wo liegt es, was muss zuerst weg?“.

### Annahmen

- Ein einzelner Nutzer-Account (Haushalt); keine öffentliche Registrierung.
- Kein Offline-Betrieb für Änderungen erforderlich.
- Druck auf einem Etikettendrucker (z. B. Brother QL, Dymo) über den Browser-Druckdialog.

### Nicht im Umfang (v1)

- Verlauf/Archiv entnommener Einträge, Statistiken.
- Mehrere Nutzer bzw. geteilte Haushalte.
- Teil-Entnahmen (Menge ist reine Info).
- Native App-Store-Apps.

## Architektur

- **Frontend:** React + TypeScript + Vite als Progressive Web App (installierbar am Handy,
  nutzbar im Browser am PC). Hosting als statische Seite auf GitHub Pages (HTTPS, nötig für
  Kamerazugriff).
- **Backend:** Supabase (Postgres, Auth, Realtime), Projekt in EU-Region, kostenloser Tarif.
  Das Frontend spricht direkt mit Supabase über `@supabase/supabase-js`.
- **Sicherheit:** Login per E-Mail + Passwort. Registrierung in Supabase deaktiviert, der
  Nutzer wird einmalig manuell angelegt. Row-Level-Security: nur authentifizierte Nutzer
  dürfen lesen/schreiben. Der öffentliche (anon) Schlüssel im Frontend ist dadurch unkritisch.
- **Sync:** Supabase Realtime auf der Tabelle `items`; Änderungen erscheinen auf allen
  geöffneten Geräten ohne Neuladen.
- **Routing:** Hash-Routing (`#/…`), damit GitHub Pages ohne Server-Rewrites funktioniert.
- **Datenzugriff:** gekapselt in einem Modul (`src/data/`) mit klarer Schnittstelle
  (z. B. `listItems`, `createItem`, `removeItem`, `restoreItem`, `listFreezers`, …).
  Die UI hängt nur von dieser Schnittstelle ab und ist dadurch ohne Supabase testbar.

## Datenmodell

| Tabelle | Felder |
|---|---|
| `freezers` | `id` uuid PK, `name` text, `sort_order` int |
| `compartments` | `id` uuid PK, `freezer_id` uuid FK → freezers (ON DELETE CASCADE), `name` text, `sort_order` int |
| `categories` | `id` uuid PK, `name` text, `max_months` int (empfohlene Lagerdauer) |
| `items` | `id` uuid PK, `short_code` text unique, `name` text, `details` text null, `quantity` text null, `category_id` uuid FK → categories, `compartment_id` uuid FK → compartments, `frozen_at` date, `created_at` timestamptz |

- Fremdschlüssel von `items` sind `ON DELETE RESTRICT`: Geräte, Fächer und Kategorien mit
  zugeordneten Einträgen können nicht gelöscht werden. Ein Fach-Löschen ist ebenfalls
  blockiert, solange Einträge darin liegen; ein Gerät kann nur gelöscht werden, wenn
  keine seiner Fächer Einträge enthält (Fächer werden dann mitgelöscht).
- **Entnehmen löscht** den Datensatz. Die App hält den gelöschten Datensatz kurz im
  Speicher; „Rückgängig“ fügt ihn mit identischer `id` und identischem `short_code`
  wieder ein (so bleibt das gedruckte Label gültig).
- **Kurzcode:** 4 Zeichen aus einem verwechslungsarmen Alphabet
  (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`, ohne 0/O/1/I/L). Wird clientseitig erzeugt; bei
  Unique-Konflikt wird neu erzeugt (max. 5 Versuche).
- **Standardkategorien** (per Migration angelegt, änderbar): Fleisch 6, Geflügel 6,
  Fisch 4, Gemüse 12, Obst 12, Brot & Backwaren 3, Fertiggerichte 3, Suppen & Soßen 4,
  Sonstiges 6 (Monate).

## Haltbarkeitsstatus

Ablaufdatum = `frozen_at` + `max_months` der Kategorie.

- **ok:** heute < Ablaufdatum − 1 Monat
- **bald (gelb):** Ablaufdatum − 1 Monat ≤ heute < Ablaufdatum
- **überfällig (rot):** heute ≥ Ablaufdatum

Berechnung als reine Funktion (`src/domain/expiry.ts`), unabhängig von UI und Datenbank.

## QR-Code

- Inhalt: URL `https://<user>.github.io/FreezerManager/#/take/<item-id>`.
- Scan mit der normalen Handy-Kamera öffnet direkt die Entnahme-Seite.
- Der In-App-Scanner erkennt dieselbe URL und extrahiert die ID; QR-Codes, die nicht
  diesem Muster entsprechen, werden ignoriert.
- Erzeugung mit der Bibliothek `qrcode`, Scan mit `html5-qrcode` (bzw. einer
  vergleichbaren, gepflegten Bibliothek).

## Bildschirme

1. **Login** – E-Mail + Passwort. Ohne Session werden alle anderen Routen hierher umgeleitet.
2. **Übersicht** (`#/`, Startseite)
   - Umschalter „nach Kategorie“ (gruppiert, je Gruppe nach Alter sortiert) /
     „nach Alter“ (flache Liste, älteste zuerst).
   - Filter nach Gerät; Suchfeld (Name, Details, Kurzcode).
   - Zeile: Name, Menge, Ort („Gerät › Fach“), Alter („vor 4 Monaten“), Statusfarbe.
   - Tipp auf Zeile → Detailansicht.
3. **Detail** (`#/item/<id>`) – alle Felder, Aktionen: Bearbeiten, Label drucken, Entnehmen.
4. **Einfrieren** (`#/new`) und **Bearbeiten** (`#/item/<id>/edit`)
   - Felder: Name (Pflicht, mit Vorschlägen aus bestehenden Namen), Details, Menge,
     Kategorie (Pflicht), Gerät → Fach (Pflicht), Einfrierdatum (Pflicht, Standard heute).
   - Buttons „Speichern“ und „Speichern & Label drucken“.
   - Nach dem Speichern bleiben Kategorie, Gerät und Fach für den nächsten Eintrag vorausgewählt
     (im `localStorage` des jeweiligen Browsers).
5. **Scannen** (`#/scan`) – Kamera dauerhaft aktiv. Treffer → Karte mit Name, Ort,
   Button „Entnehmen“. Danach Hinweis mit „Rückgängig“ (ca. 8 s), Scanner sofort wieder bereit.
   Fallback: manuelle Eingabe des Kurzcodes.
6. **Entnahme** (`#/take/<id>`) – Ziel des QR-Codes: Details + Button „Entnehmen“, danach
   „Rückgängig“-Hinweis und Link zur Übersicht.
7. **Einstellungen** (`#/settings`)
   - Geräte und Fächer anlegen, umbenennen, sortieren, löschen.
   - Kategorien mit Haltbarkeit (Monate) anlegen, bearbeiten, löschen.
   - Labelgröße (Breite × Höhe in mm), gespeichert im `localStorage` des Geräts.

Navigation: untere Tab-Leiste am Handy (Übersicht, Scannen, Einfrieren, Einstellungen),
seitliche/obere Leiste am PC. Oberfläche auf Deutsch.

## Label-Druck

- Eigene Druckansicht, die nur das Label rendert; Druck über `window.print()`.
- CSS `@page { size: <breite>mm <höhe>mm; margin: 0 }`, Standard **62 × 29 mm**
  (Brother DK-11209). Größe in den Einstellungen anpassbar.
- Layout: links QR-Code (quadratisch, Höhe des Labels abzüglich Rand), rechts:
  **Name** (fett, ggf. gekürzt), Menge · Details, Kategorie, Einfrierdatum (TT.MM.JJJJ),
  Ort, Kurzcode.
- Ein Label pro Druckvorgang.
- README beschreibt die einmalige Einstellung des Etikettenformats im Druckertreiber.

## Fehlerbehandlung

- **Keine Verbindung / Supabase-Fehler:** verständliche Fehlermeldung, Formularinhalt bleibt
  erhalten. Der Service Worker cached nur die App-Oberfläche, nicht die Daten.
- **Eintrag nicht gefunden** (bereits entnommen, unbekannte ID/Kurzcode): Hinweis
  „Nicht (mehr) im Bestand“.
- **Fremder QR-Code:** wird im Scanner ignoriert.
- **Löschen von Gerät/Fach/Kategorie mit Einträgen:** blockiert, Hinweis mit Anzahl der Einträge.
- **Kamera verweigert / nicht verfügbar:** Hinweis plus manuelle Kurzcode-Eingabe.
- **Session abgelaufen:** Umleitung zum Login, danach zurück zur ursprünglichen Route.

## Tests

- **Unit-Tests (Vitest)** für reine Logik: Haltbarkeitsstatus, Altersanzeige,
  Kurzcode-Erzeugung, Gruppierung/Sortierung/Filter der Übersicht, QR-URL erzeugen/parsen.
- **Komponententests (Vitest + Testing Library)** für Formular, Übersicht, Entnahme-Ablauf
  inkl. Rückgängig, mit In-Memory-Implementierung der Datenschnittstelle.
- Kamera-Scan und Druck werden manuell geprüft (Checkliste in der README).

## Betrieb & Einrichtung

- `supabase/migrations/*.sql`: Tabellen, Constraints, RLS-Policies, Standardkategorien,
  Realtime-Freigabe für `items`.
- GitHub Action: Build bei Push auf `main`, Deployment auf GitHub Pages.
  `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` als Repository-Secrets.
- README: Supabase-Projekt anlegen (EU), SQL ausführen, Nutzer anlegen, Registrierung
  deaktivieren, Secrets setzen, GitHub Pages aktivieren, Druckertreiber einstellen,
  App am Handy zum Startbildschirm hinzufügen.
- Lokale Entwicklung: `npm install`, `.env.local` mit den beiden Variablen, `npm run dev`.
