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

### 2. GitHub Pages

1. Im Repository unter **Settings › Secrets and variables › Actions** zwei Secrets anlegen:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public Key
2. **Settings › Pages › Source**: „GitHub Actions“ wählen.
3. Auf `main` pushen (oder den Workflow „Deploy to GitHub Pages“ manuell starten).
   Die App ist dann unter `https://<github-name>.github.io/FreezerManager/` erreichbar.

### 3. Etikettendrucker

Gedruckt wird über den normalen Druckdialog des Browsers, ein Label pro Druck.

- Im Druckertreiber (bzw. im Druckdialog) das Papierformat auf das Etikett stellen,
  Standard ist **62 × 29 mm** (z. B. Brother DK-11209).
- Ränder: **Keine**, Skalierung: **100 %**, Kopf-/Fußzeilen aus.
- Andere Etiketten (z. B. Dymo): Größe in der App unter **Einstellungen › Label** anpassen.

### 4. Handy

Seite im Browser öffnen, anmelden und **„Zum Startbildschirm hinzufügen“** wählen
(Safari: Teilen-Menü; Chrome: Menü ⋮). Die App startet dann wie eine normale App.
Der Kamerazugriff funktioniert nur über HTTPS – GitHub Pages erfüllt das.

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

- [ ] Einfrieren am PC mit „Speichern & Label drucken“ → genau ein Label, richtig skaliert.
- [ ] Label mit der **normalen Kamera-App** des Handys scannen → Entnahme-Seite öffnet sich.
- [ ] In der App unter **Scannen** ein Label scannen → Karte erscheint, „Entnehmen“ funktioniert,
      „Rückgängig“ stellt den Eintrag wieder her.
- [ ] Am Handy entnehmen, während die Übersicht am PC offen ist → Eintrag verschwindet dort
      ohne Neuladen.
- [ ] Kurzcode manuell eingeben (z. B. bei verschmiertem QR-Code) → Eintrag wird gefunden.
