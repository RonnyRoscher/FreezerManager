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
2. **SQL Editor** öffnen, nacheinander den Inhalt von `supabase/migrations/0001_init.sql` und
   `supabase/migrations/0002_households.sql` einfügen und ausführen. Das legt Tabellen,
   Zugriffsregeln und Standardkategorien an. `0002` legt außerdem den Haushalt „Unser
   Haushalt“ mit den Standardkategorien an. `0001` und `0002` werden jeweils nur einmal
   ausgeführt.
   (Bestehendes Projekt? Dann siehe „Umstellung auf Haushalte“ weiter unten.)
3. **Authentication › Users › Add user**: eigenen Nutzer (E-Mail + Passwort) anlegen,
   „Auto Confirm User“ aktivieren. Anschließend im SQL Editor sich selbst in den Haushalt
   aufnehmen und zum Admin machen:

   ```sql
   update public.profiles
     set is_admin = true,
         household_id = (select id from public.households where name = 'Unser Haushalt')
     where email = '<deine E-Mail>';
   ```
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
  auswählen. Danach verbindet sich die App beim Start normalerweise von selbst. Chrome merkt
  sich die Freigabe aber nicht bei jedem Gerät dauerhaft: Steht dort nach einem Neustart oder
  erneutem Einstecken „Nicht verbunden“, einfach noch einmal „Drucker verbinden“ klicken.
- Die Etikettengröße liest die App aus der eingelegten Rolle.
- Ist das Etikett zu blass oder zu dunkel: **Druckdichte** (1–9, Standard 4) anpassen.
- Die Katasymbol-App beim Drucken schließen, sonst ist der Drucker belegt.
- „Label drucken“ (Detailseite) und „Speichern & Label drucken“ (Einfrieren) drucken sofort,
  ohne Druckdialog.

#### Am Android-Handy per Bluetooth

Am Android-Handy druckt die App per **Bluetooth** auf denselben Drucker (Chrome, auch als
installierte App). Einrichten muss man nichts:

- Bluetooth am Handy einschalten (manche Android-Versionen verlangen zusätzlich **Standort**).
- Beim **ersten Druck nach dem Öffnen der App** erscheint eine Auswahl: den Drucker „T0…“
  wählen. Danach druckt jeder Tipp sofort, solange die App offen ist. Chrome merkt sich den
  Drucker nicht über einen Neustart der App hinaus.
- Bricht die Verbindung ab (Drucker aus, App im Hintergrund), verbindet sich der nächste Druck
  ohne erneute Auswahl.
- Der Drucker spricht immer nur mit einem Gerät: Katasymbol-App schließen und nicht
  gleichzeitig per USB am PC verbinden.
- Einen anderen Drucker wählen: **Einstellungen › Drucker › „Drucker verbinden“** – die Auswahl
  erscheint dort immer, auch wenn schon ein Drucker gemerkt ist.
- **iPhone:** Safari unterstützt kein Bluetooth für Webseiten – dort nur „Auf Papier drucken“.

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

## Mehrere Haushalte

Jeder Haushalt hat eigene Gefriergeräte, Fächer, Kategorien und Lebensmittel; niemand sieht
die Daten eines anderen Haushalts. Jedes Konto gehört zu genau einem Haushalt. **Admins**
(`is_admin`) können zusätzlich Haushalte verwalten.

- **Konto anlegen:** in Supabase unter **Authentication › Users › Add user** (E-Mail +
  Passwort, „Auto Confirm User“ aktivieren). Das Konto hat zunächst keinen Haushalt und sieht
  nichts.
- **Zuordnen:** in der App auf der Seite **Verwaltung** (nur für Admins) das Konto dem
  gewünschten Haushalt zuweisen. Daten werden dabei nie verschoben oder gelöscht.
- **Haushalt anlegen / umbenennen:** ebenfalls auf der Verwaltungsseite. Ein neuer Haushalt
  bekommt die Standardkategorien.
- **Haushalt öffnen:** Admins können jeden Haushalt öffnen und darin arbeiten; ein Hinweis
  zeigt den geöffneten Haushalt, „Zurück zu meinem Haushalt“ führt in den eigenen. Den
  Haushalt am besten immer nur auf einem Gerät wechseln: Die Auswahl gilt für das Konto, andere
  offene Geräte folgen innerhalb von etwa 30 Sekunden.
- **Löschen** geht nur bei Haushalten ohne Mitglieder, Gefriergeräte und Lebensmittel.
- **Weiteren Admin ernennen** (im SQL Editor):

  ```sql
  update public.profiles set is_admin = true where email = '<E-Mail des Kontos>';
  ```

## Umstellung auf Haushalte (einmalig)

Gilt für ein **bestehendes** Projekt, das bisher nur `0001_init.sql` kennt. Die Migration
`0002_households.sql` ändert nichts an den Daten: alle Zeilen und Konten wandern in den
Haushalt „Unser Haushalt“, nichts wird gelöscht. Die bisherige App läuft währenddessen
unverändert weiter. Trotzdem sicherheitshalber in dieser Reihenfolge:

1. **Sicherung:** im Supabase-Dashboard unter **Table Editor** die vier Tabellen `freezers`,
   `compartments`, `categories` und `items` jeweils als CSV exportieren und aufheben.
2. **Test-Projekt:** ein zweites kostenloses Supabase-Projekt anlegen und dort
   `0001_init.sql` ausführen. Beispieldaten einfügen, z. B.:

   ```sql
   insert into freezers (name) values ('Keller');
   insert into compartments (freezer_id, name)
     select id, 'Fach 1' from freezers where name = 'Keller';
   insert into items (short_code, name, category_id, compartment_id, frozen_at)
     select 'T1ST', 'Gulasch', k.id, c.id, current_date
     from categories k, compartments c where k.name = 'Fleisch' and c.name = 'Fach 1';
   ```

   Dann `supabase/check-migration.sql` **Teil 1** ausführen und die Zahlen notieren,
   anschließend `0002_households.sql` ausführen und **Teil 1 und Teil 2** der Prüfung
   ausführen. Erwartet: Teil 1 liefert dieselben Zeilenzahlen je Tabelle wie vorher, Teil 2a
   zeigt einen Haushalt „Unser Haushalt“ mit allen Zeilen, Teil 2b liefert überall `0`
   (keine Zeile ohne Haushalt).
3. **Produktion:** im echten Projekt zuerst `check-migration.sql` **Teil 1** ausführen und
   die Zahlen notieren, dann `0002_households.sql`, danach Teil 1 und Teil 2 erneut. Die
   Zahlen müssen gleich sein, Teil 2b muss überall `0` zeigen. Die bisherige App
   funktioniert in der Zwischenzeit weiter. `0002_households.sql` darf nicht ein zweites Mal
   ausgeführt werden; ein zweiter Lauf schlägt fehl und ändert nichts, weil die Migration eine
   einzige Transaktion ist. Während `0002` läuft, können offene Apps mehrfach neu laden (jede
   Zeile bekommt ihren Haushalt, das löst Live-Aktualisierungen aus). Das ist harmlos, am
   besten läuft die Migration aber, wenn die App gerade nicht benutzt wird.
4. **Admin:** das eigene Konto ist durch die Migration schon im Haushalt „Unser Haushalt“;
   nur noch zum Admin machen:

   ```sql
   update public.profiles set is_admin = true where email = '<deine E-Mail>';
   ```
5. **Neue App:** den neuen Stand auf `main` pushen; der Workflow stellt ihn auf GitHub Pages
   bereit. Danach die App neu laden und prüfen, dass alle Daten da sind und die Seite
   **Verwaltung** erscheint. Eventuell ist dafür zweimaliges Neuladen oder ein Schließen und
   erneutes Öffnen der App nötig (Service-Worker-Update).

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
- [ ] Am Android-Handy nach dem Öffnen der App „Label drucken“ → Druckerauswahl, Etikett kommt
      heraus; zweiter Druck ohne Auswahl.
- [ ] Drucker aus- und wieder einschalten, dann am Handy drucken → verbindet sich neu, druckt.
- [ ] Label mit der **normalen Kamera-App** des Handys scannen → Entnahme-Seite öffnet sich.
- [ ] In der App unter **Scannen** ein Label scannen → Karte erscheint, „Entnehmen“ funktioniert,
      „Rückgängig“ stellt den Eintrag wieder her.
- [ ] Am Handy entnehmen, während die Übersicht am PC offen ist → Eintrag verschwindet dort
      ohne Neuladen.
- [ ] Kurzcode manuell eingeben (z. B. bei verschmiertem QR-Code) → Eintrag wird gefunden.
