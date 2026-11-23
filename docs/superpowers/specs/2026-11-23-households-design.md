# Mehrere Haushalte – Design

Datum: 2026-11-23

## Warum

Die App soll von weiteren Familien-Haushalten genutzt werden. Jeder Haushalt sieht und
verwaltet nur seine eigenen Gefriergeräte, Fächer, Kategorien und Lebensmittel. Der Nutzer
(Admin) legt die Zugänge für die Familienmitglieder selbst an und ordnet sie Haushalten zu.
Der bestehende Haushalt in der Produktivumgebung darf dabei nichts verlieren und die laufende
App nicht gestört werden.

## Ziele

- Daten (Geräte, Fächer, Kategorien, Lebensmittel) gehören zu genau einem Haushalt.
- Ein Benutzer gehört zu höchstens einem Haushalt und sieht nur dessen Daten.
- Der Admin hat eine Verwaltungsseite: Haushalte anlegen, umbenennen, (leere) löschen;
  Benutzer einem Haushalt zuordnen; jeden Haushalt öffnen und darin voll mitverwalten.
- Bestehende Daten und Benutzer werden verlustfrei dem bisherigen Haushalt zugeordnet.
- Die Trennung wird von der Datenbank erzwungen (Row-Level-Security), nicht nur von der App.

## Nicht-Ziele

- Konten aus der App anlegen, Einladungs-Mails, Selbstregistrierung (Konten legt der Admin
  wie bisher im Supabase-Dashboard an; Registrierung bleibt abgeschaltet).
- Ein Benutzer in mehreren Haushalten.
- Gemeinsame Kategorien über Haushalte hinweg.

## Anti-Ziele

- Datenverlust im bestehenden Haushalt – durch die Umstellung, durch einen Haushaltswechsel
  des Admins, durch einen Haushalt ohne Mitglieder oder durch das Löschen eines Kontos.
- Ein Benutzer sieht oder ändert Daten eines fremden Haushalts.
- Der Admin legt etwas im falschen Haushalt an, ohne es zu merken.

## Ansätze

1. **Konten im Supabase-Dashboard anlegen, Zuordnung auf der Verwaltungsseite** – *gewählt.*
   Kein Server-Code, kein zusätzlicher geheimer Schlüssel; neue Konten erscheinen automatisch
   auf der Verwaltungsseite.
2. **Konten auf der Verwaltungsseite anlegen** über eine Supabase-Edge-Function mit dem
   Admin-Schlüssel – bequemer, aber mehr bewegliche Teile; nicht gewählt.
3. **Ein Supabase-Projekt je Haushalt** – keine Verwaltungsseite möglich, je Haushalt eigene
   Adresse und Veröffentlichung; verworfen.

Vom Nutzer entschieden: Kategorien gehören zum Haushalt; der Admin darf in fremden Haushalten
voll mitverwalten (nicht nur lesen).

## Datenmodell (Migration `supabase/migrations/0002_households.sql`)

### Neue Tabellen

| Tabelle | Felder |
|---|---|
| `households` | `id` uuid PK, `name` text not null, `created_at` timestamptz |
| `profiles` | `user_id` uuid PK → `auth.users(id)` **on delete cascade**, `email` text, `household_id` uuid null → `households` **on delete restrict**, `active_household_id` uuid null → `households` **on delete set null**, `is_admin` boolean not null default false |

- `household_id`: zu welchem Haushalt das Konto gehört („mein Haushalt“).
- `active_household_id`: nur für Admins – welchen Haushalt die App gerade zeigt. Ein
  Haushaltswechsel ändert nur dieses Feld, nie `household_id`.
- Ein Trigger auf `auth.users` (insert) legt automatisch ein Profil mit E-Mail an
  (`security definer`). Ein gelöschtes Konto löscht nur sein Profil.

### Bestehende Tabellen

`freezers`, `compartments`, `categories`, `items` erhalten `household_id uuid not null`
→ `households(id)` **on delete restrict**, plus Index.

### Aktueller Haushalt

Funktion `current_household() returns uuid` (`stable`, `security definer`):
für Admins `coalesce(active_household_id, household_id)`, sonst `household_id` des
angemeldeten Benutzers; ohne Profil/Haushalt `null`.

### Zuordnung neuer Zeilen (Trigger, `before insert`)

- `freezers`, `categories`: `household_id := coalesce(new.household_id, current_household())`;
  ist das Ergebnis `null` → Fehler „Kein Haushalt zugeordnet“.
- `compartments`: `household_id :=` Haushalt des Geräts (`freezer_id`).
- `items`: `household_id :=` Haushalt des Fachs (`compartment_id`); gehört die Kategorie zu
  einem anderen Haushalt → Fehler.
- Bei `update` von `items.compartment_id`/`category_id` gelten dieselben Regeln.

Damit schreibt auch die heutige App (die kein `household_id` kennt) weiterhin korrekt,
und „Rückgängig“ nach einer Entnahme landet immer im richtigen Haushalt.

### Zugriffsregeln (RLS)

- Die bisherigen Policies „authenticated full access“ werden entfernt.
- `freezers`, `compartments`, `categories`, `items`: lesen und schreiben nur, wenn
  `household_id = current_household()`. Für Admins ist das der aktive Haushalt; dadurch
  zeigt auch eine App ohne Haushaltsfilter immer genau einen Haushalt.
- `households`: Mitglieder lesen ihren eigenen Haushalt; Admins lesen alle. Schreiben nur
  über die Admin-Funktionen unten.
- `profiles`: jeder liest sein eigenes Profil; Admins lesen alle. Direktes Schreiben gesperrt;
  Änderungen nur über die Funktionen unten.

### Funktionen (RPC, `security definer`, prüfen `is_admin` selbst)

- `create_household(name text) returns households` – legt den Haushalt an und kopiert die
  9 Standardkategorien (Fleisch 6, Geflügel 6, Fisch 4, Gemüse 12, Obst 12,
  Brot & Backwaren 3, Fertiggerichte 3, Suppen & Soßen 4, Sonstiges 6 Monate) hinein.
- `rename_household(id uuid, name text)`.
- `delete_household(id uuid)` – nur wenn der Haushalt **keine Mitglieder, keine Geräte und
  keine Lebensmittel** hat; sonst Fehler mit Grund. Seine Kategorien werden dabei mit
  gelöscht: Sie sind Einstellungen des Haushalts (beim Anlegen automatisch kopiert), keine
  eingetragenen Lebensmittel. Ohne das ließe sich ein gerade angelegter, nie genutzter
  Haushalt nicht löschen. (Die Fremdschlüssel `on delete restrict` sichern Geräte, Fächer,
  Lebensmittel und Mitglieder zusätzlich in der Datenbank ab.) *(Meine Entscheidung.)*
- `set_member_household(user_id uuid, household_id uuid null)` – ordnet ein Konto zu oder
  hebt die Zuordnung auf. Daten werden dabei nie verschoben oder gelöscht.
- `set_active_household(household_id uuid)` – nur Admins; setzt `active_household_id`.
  `null` = zurück zum eigenen Haushalt.

### Übernahme der bestehenden Daten (in derselben Migration, eine Transaktion)

1. Haushalt „Unser Haushalt“ anlegen.
2. Alle vorhandenen Zeilen in `freezers`, `compartments`, `categories`, `items` diesem
   Haushalt zuordnen, danach `household_id` auf `not null` setzen.
3. Für alle vorhandenen Konten in `auth.users` ein Profil anlegen, Haushalt = „Unser Haushalt“.
4. Erst dann alte Policies entfernen und neue anlegen.

Wer Admin ist, setzt der Nutzer danach selbst mit einer SQL-Zeile im Dashboard
(`update profiles set is_admin = true where email = '…';`). Seine E-Mail-Adresse steht nicht
in der Migration, weil das Repository öffentlich ist.

## App

### Datenzugriff

`Repository` erhält:

- `getProfile(): Promise<Profile | null>` mit `email`, `isAdmin`, `household: { id, name } | null`
  (eigener), `activeHousehold: { id, name } | null` (aktuell gezeigter).
- Admin: `listHouseholds()` (mit Mitgliederzahl), `createHousehold(name)`,
  `renameHousehold(id, name)`, `deleteHousehold(id)`, `listProfiles()`,
  `setMemberHousehold(userId, householdId | null)`, `setActiveHousehold(householdId | null)`.
- Die bestehenden Abfragen bleiben unverändert (RLS filtert).
- In-Memory-Repository (Tests, Demo-Modus) bildet dasselbe Verhalten nach.

### Oberfläche

- **Kopfzeile:** Name des aktiven Haushalts. Ist der Admin in einem fremden Haushalt:
  deutlich hervorgehoben „Haushalt: <Name>“ mit Button „Zurück zu meinem Haushalt“.
- **Navigation:** Eintrag „Verwaltung“ nur für Admins.
- **Verwaltungsseite `#/admin`:**
  - Haushalte: Liste mit Mitgliederzahl, anlegen, umbenennen, löschen (nur leere; sonst
    Meldung mit Grund), „Öffnen“.
  - Benutzer: Liste aller Profile (E-Mail, Admin-Kennzeichen) mit Auswahlfeld
    „Haushalt“ (inkl. „– keiner –“). Neue Konten aus dem Dashboard erscheinen hier als
    „keinem Haushalt zugeordnet“.
  - Hinweis: „Neue Konten im Supabase-Dashboard unter Authentication › Add user anlegen.“
- **Haushalt wechseln:** nach `setActiveHousehold` lädt die App alle Daten neu (Übersicht).
- **Aktiver Haushalt auf mehreren Geräten:** Der aktive Haushalt gilt fürs Konto, also auf
  allen Geräten des Admins. Damit kein zweites Gerät oder Tab unbemerkt im falschen Haushalt
  arbeitet, liest die App das Profil neu, sobald sie wieder sichtbar wird oder den Fokus
  bekommt (wie schon die Übersicht ihre Daten); hat sich der aktive Haushalt geändert,
  aktualisiert sie Kopfzeile und Daten. Pro-Gerät-Haushalte wären deutlich aufwendiger
  (Haushalt bei jeder Anfrage mitschicken) und bringen für einen Admin wenig.
  *(Meine Entscheidung.)* Restrisiko: eine noch zwischengespeicherte alte App-Version kennt
  den Hinweis nicht; sie wird beim nächsten Öffnen automatisch ersetzt.
- **Konto ohne Haushalt:** statt der App nur „Dein Konto ist noch keinem Haushalt
  zugeordnet. Bitte wende dich an den Admin.“ und „Abmelden“.
- **Demo-Modus:** ein Haushalt, Demo-Benutzer ist Admin (damit die Verwaltungsseite
  ausprobiert werden kann).

## Einführung ohne Störung

1. **Sicherung:** im Supabase-Dashboard die vier Tabellen als CSV exportieren.
2. **Test-Projekt:** zweites (kostenloses) Supabase-Projekt anlegen, `0001` ausführen,
   Beispieldaten einfügen, `0002` ausführen, Prüf-SQL aus der README laufen lassen
   (Zeilenzahlen vorher/nachher gleich, alle Zeilen einem Haushalt zugeordnet).
3. **Produktiv:** `0002` im echten Projekt ausführen. Die heutige App läuft unverändert
   weiter (RLS liefert den einzigen Haushalt, Trigger ordnen neue Zeilen zu).
4. Admin-Zeile ausführen.
5. Neue App veröffentlichen.

Die Migration wird vor der Übergabe in dieser Umgebung gegen ein lokales PostgreSQL mit
nachgebildetem Supabase-`auth`-Schema getestet (Datenübernahme, RLS je Rolle, Trigger,
Funktionen, Löschsperren).

## Tests

- **SQL** (lokales PostgreSQL, Skript im Repo): Übernahme ohne Verlust; Mitglied A sieht
  keine Daten von B und kann keine schreiben; Admin sieht nur den aktiven Haushalt, kann ihn
  wechseln und darin schreiben; neue Zeilen landen im aktiven Haushalt; Fach/Lebensmittel
  erben den Haushalt; Kategorie aus fremdem Haushalt abgelehnt; `delete_household` verweigert
  nicht-leere Haushalte; Konto löschen lässt Haushaltsdaten unberührt; Nicht-Admins können
  die Admin-Funktionen nicht nutzen und ihr Profil nicht ändern; Haushaltswechsel des Admins
  ändert `household_id` nicht.
- **App** (Vitest, In-Memory-Repository): Verwaltungsseite (anlegen, umbenennen, löschen
  verweigert, zuordnen, öffnen); Kopfzeilen-Hinweis und Rückweg; Navigation nur für Admins;
  Konto ohne Haushalt; nach Wechsel neu geladene Daten.

## Dem Umsetzenden überlassen

- Aufteilung des SQL in Abschnitte, Namen von Triggern und Policies.
- Ob das App-weite Neuladen nach dem Haushaltswechsel per Neu-Mount oder Seiten-Reload passiert.
- Genaue Texte kleiner Hinweise.
