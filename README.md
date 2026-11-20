# FreezerManager

Kleine Web-App (PWA) zur Verwaltung von Gefriergut:

- **Einfrieren** (z. B. am PC): Lebensmittel, Details, Menge, Kategorie, Datum und Ort
  (Gerät › Fach) erfassen und ein **Label mit QR-Code** drucken.
- **Entnehmen** (am Handy): QR-Code scannen – mit der App oder einfach der normalen
  Kamera-App – und „Entnehmen“ tippen. Kurz danach ist „Rückgängig“ möglich.
- **Übersicht**: nach Kategorie oder Alter, filterbar nach Gerät, mit Suche. Einträge kurz vor
  bzw. nach Ablauf der Haltbarkeit (je Kategorie einstellbar) sind gelb bzw. rot markiert.

Die Daten liegen in [Supabase](https://supabase.com) (Postgres), daher sehen PC und Handy
immer denselben Stand. Die App selbst wird als statische Seite auf GitHub Pages gehostet.

Design und Plan: `docs/superpowers/specs/` und `docs/superpowers/plans/`.

## Einrichtung

### 1. Supabase

1. Unter [supabase.com](https://supabase.com) kostenlos ein Projekt anlegen, Region
   **EU (z. B. Frankfurt)** wählen.
2. **SQL Editor** öffnen, den Inhalt von `supabase/migrations/0001_init.sql` einfügen und
   ausführen. Das legt Tabellen, Zugriffsregeln und Standardkategorien an.
3. **Authentication › Users › Add user**: eigenen Nutzer (E-Mail + Passwort) anlegen,
   „Auto Confirm User“ aktivieren.
4. **Authentication › Sign In / Providers**: „Allow new users to sign up“ **deaktivieren**,
   damit sich niemand sonst registrieren kann.
5. **Project Settings › API**: `Project URL` und den `anon public` Key notieren.
   Der anon Key darf öffentlich sein – ohne Login gibt die Datenbank nichts heraus.
6. **Authentication › URL Configuration**:
   - **Site URL** auf `https://<github-name>.github.io/FreezerManager/` setzen
     (Standard ist `http://localhost:3000` – dann führen alle E-Mail-Links ins Leere).
   - Dieselbe Adresse unter **Redirect URLs** hinzufügen.

   Erst dann funktionieren Magic Link, „Passwort vergessen?“ und Einladungen.
   Ein Link aus einer Passwort-Zurücksetzen-Mail öffnet in der App die Seite
   „Neues Passwort“.

### 2. GitHub Pages

1. Im Repository unter **Settings › Secrets and variables › Actions** zwei Secrets anlegen:
   - `VITE_SUPABASE_URL` = Project URL, nur `https://<projekt>.supabase.co` – ohne `/rest/v1/`
   - `VITE_SUPABASE_ANON_KEY` = anon public Key
2. **Settings › Pages › Source**: „GitHub Actions“ wählen.
3. Auf `main` pushen (oder den Workflow „Deploy to GitHub Pages“ manuell starten).
   Die App ist dann unter `https://<github-name>.github.io/FreezerManager/` erreichbar.

### 3. Etikettendrucker

Die App druckt direkt per USB auf Katasymbol-/Supvan-Etikettendrucker der T50/T80-Reihe
(getestet: Katasymbol T50M Pro mit 40 × 30 mm-Etiketten). Der Windows-Druckertreiber wird
dafür nicht gebraucht.

- Nur in **Chrome oder Edge am PC**, Drucker per **USB-Kabel** angeschlossen.
- Einmalig unter **Einstellungen › Drucker** auf „Drucker verbinden“ klicken und den Drucker
  auswählen. Danach verbindet sich die App bei jedem Start von selbst.
- Die Etikettengröße liest die App aus der eingelegten Rolle.
- Ist das Etikett zu blass oder zu dunkel: **Druckdichte** (1–9, Standard 4) anpassen.
- Die Katasymbol-App beim Drucken schließen, sonst ist der Drucker belegt.
- „Label drucken“ (Detailseite) und „Speichern & Label drucken“ (Einfrieren) drucken sofort,
  ohne Druckdialog.

#### Notlösung: auf Papier drucken

Ohne Etikettendrucker (oder am Handy) auf der Detailseite **„Auf Papier drucken“** wählen.
Das Etikett kommt in Originalgröße oben links auf ein A4-Blatt, mit gestrichelter
Schnittlinie zum Ausschneiden. Im Druckdialog Ränder „Standard“ und Skalierung **100 %**.

### 4. Handy

Seite im Browser öffnen, anmelden und **„Zum Startbildschirm hinzufügen“** wählen
(Safari: Teilen-Menü; Chrome: Menü ⋮). Die App startet dann wie eine normale App.
Der Kamerazugriff funktioniert nur über HTTPS – GitHub Pages erfüllt das.

### Anmeldung klappt nicht?

- **„E-Mail oder Passwort falsch.“** – In der App unter „Passwort vergessen?“ einen Link
  anfordern (oder in Supabase unter Authentication › Users beim Nutzer „Send password
  recovery“) und ein neues Passwort setzen.
- **„Die E-Mail-Adresse ist noch nicht bestätigt.“** – In Supabase unter
  Authentication › Users den Nutzer öffnen und bestätigen („Confirm email“), oder den
  Nutzer mit „Auto Confirm User“ neu anlegen.
- **„Der Link ist abgelaufen oder wurde schon benutzt.“** – Links gelten nur einmal und
  nur kurz. Einen neuen anfordern und nur einmal anklicken.

## Lokale Entwicklung

```bash
npm install
cp .env.example .env.local   # Supabase-URL und anon Key eintragen
npm run dev
```

Ohne `.env.local` startet die App im **Demo-Modus** mit Beispieldaten im Speicher
(nichts wird gespeichert) – praktisch zum Ausprobieren.

```bash
npm test         # Unit- und Komponententests
npm run build    # Typprüfung + Produktions-Build nach dist/
```

## Manuelle Prüf-Checkliste

Kamera und Drucker lassen sich nicht automatisiert testen. Nach dem ersten Deployment:

- [ ] Einfrieren am PC mit „Speichern & Label drucken“ → Etikett kommt sofort aus dem
      Etikettendrucker, lesbar und richtig herum.
- [ ] Drucker-USB-Kabel ziehen → Einstellungen zeigen „Nicht verbunden“; wieder einstecken →
      „Verbunden“, ohne Klick. Seite neu laden → verbindet sich von selbst.
- [ ] „Auf Papier drucken“ → A4 mit Etikett in Originalgröße und Schnittlinie.
- [ ] Label mit der **normalen Kamera-App** des Handys scannen → Entnahme-Seite öffnet sich.
- [ ] In der App unter **Scannen** ein Label scannen → Karte erscheint, „Entnehmen“ funktioniert,
      „Rückgängig“ stellt den Eintrag wieder her.
- [ ] Am Handy entnehmen, während die Übersicht am PC offen ist → Eintrag verschwindet dort
      ohne Neuladen.
- [ ] Kurzcode manuell eingeben (z. B. bei verschmiertem QR-Code) → Eintrag wird gefunden.
