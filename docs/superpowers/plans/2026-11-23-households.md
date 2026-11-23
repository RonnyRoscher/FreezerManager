# Mehrere Haushalte – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daten gehören zu Haushalten, Benutzer sehen nur ihren Haushalt, der Admin verwaltet Haushalte und Zuordnungen auf einer Verwaltungsseite und kann in jedem Haushalt mitarbeiten – ohne Datenverlust für den bestehenden Haushalt.

**Architecture:** Eine zusätzliche SQL-Migration (`0002_households.sql`) führt Haushalte, Profile, `current_household()`, Zuordnungs-Trigger, neue RLS-Policies und Admin-Funktionen ein und ordnet alle Bestandsdaten einem Haushalt zu. Die App liest das Profil (Admin, eigener/aktiver Haushalt), zeigt eine Verwaltungsseite und einen Haushalts-Hinweis; Datenabfragen bleiben unverändert, weil RLS filtert. SQL wird mit PGlite (echtes PostgreSQL in Vitest) gegen ein nachgebildetes Supabase-`auth`-Schema getestet.

**Tech Stack:** PostgreSQL/Supabase (RLS, `security definer`), `@electric-sql/pglite` (neu, devDependency), React 18 + TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-households-design.md`

## Global Constraints

- `0001_init.sql` bleibt unverändert; alles Neue in `supabase/migrations/0002_households.sql`, als **eine Transaktion** (`begin; … commit;`).
- Keine E-Mail-Adressen echter Personen im Repository.
- Fremdschlüssel `household_id` von `freezers`, `compartments`, `categories`, `items`, `profiles.household_id` → `households(id)` **on delete restrict**; `profiles.active_household_id` **on delete set null**; `profiles.user_id` → `auth.users(id)` **on delete cascade**.
- Name des übernommenen Haushalts: `Unser Haushalt`.
- Standardkategorien für neue Haushalte (exakt): Fleisch 6, Geflügel 6, Fisch 4, Gemüse 12, Obst 12, Brot & Backwaren 3, Fertiggerichte 3, Suppen & Soßen 4, Sonstiges 6.
- `delete_household`: nur ohne Mitglieder, Geräte und Lebensmittel; Kategorien werden mitgelöscht. Prüfreihenfolge: Mitglieder, dann Gefriergeräte, dann Lebensmittel (der erste zutreffende Grund wird gemeldet).
- Texte (exakt):
  - Ohne Haushalt: `Dein Konto ist noch keinem Haushalt zugeordnet. Bitte wende dich an den Admin.`
  - Kopfzeile fremder Haushalt: `Haushalt: <Name>` + Button `Zurück zu meinem Haushalt`
  - Hinweis Verwaltung: `Neue Konten im Supabase-Dashboard unter Authentication › Add user anlegen.`
  - Fehler Löschen: `Haushalt kann nicht gelöscht werden: <Grund>` mit Grund `noch Mitglieder` / `noch Gefriergeräte` / `noch Lebensmittel`
  - Datenbank ohne Haushalt beim Anlegen: `Kein Haushalt zugeordnet`
- Admin-Funktionen prüfen `is_admin` selbst und werfen sonst `Nur für Admins`.

## Review Focus

1. Alte App-Version nach der Umstellung (Einfügen ohne `household_id`) funktioniert für ein Mitglied und schreibt in dessen Haushalt (Test in Task 3).
2. Admin öffnet fremden Haushalt, friert etwas ein, kehrt zurück → Eintrag im fremden Haushalt, eigener Haushalt unverändert, `household_id` des Admins unverändert (Test in Task 3).
3. Mitglied wird einem anderen Haushalt zugeordnet → Daten beider Haushalte bleiben, wo sie sind (Test in Task 3).
4. Konto ohne Haushalt meldet sich an → sieht keine Daten (DB) und nur den Hinweis (App) (Tests in Task 3 und Task 6).
5. Admin löscht den Haushalt, den er gerade geöffnet hat → geht nur, wenn leer; danach zeigt die App wieder den eigenen Haushalt (Tests in Task 3 und Task 7).

---

## Dateistruktur

```
supabase/migrations/0002_households.sql   Migration
supabase/test/auth-stub.sql               nachgebildetes Supabase: Rollen, auth.users, auth.uid(), Publication
src/test/supabaseDb.ts                    PGlite-Helfer (Schema laden, als Benutzer ausführen)
supabase/households.test.ts               SQL-Tests (Vitest)
src/domain/types.ts                       + Profile, HouseholdSummary, ProfileSummary
src/data/repository.ts                    + Profil-/Admin-Methoden
src/data/memoryRepository.ts              + Haushalte nachgebildet
src/data/supabaseRepository.ts            + RPC-Aufrufe
src/auth/ProfileContext.tsx               Profil laden, auffrischen, Wechsel
src/components/HouseholdBanner.tsx        Kopfzeilen-Hinweis
src/pages/AdminPage.tsx                   Verwaltungsseite
src/pages/NoHouseholdPage.tsx             Hinweis ohne Haushalt
```

---

### Task 1: SQL-Testumgebung mit PGlite

**Files:** Create `supabase/test/auth-stub.sql`, `src/test/supabaseDb.ts`, `supabase/households.test.ts`; Modify `package.json` (devDependency `@electric-sql/pglite`), `vite.config.ts` (Vitest `include` um `supabase/**/*.test.ts` erweitern)

**Interfaces:**
- Produces (`supabaseDb.ts`): `createDb(options?: { migrations?: ('0001' | '0002')[] }): Promise<PGlite>` – lädt Stub, dann die genannten Migrationen (Standard beide); `addUser(db, email: string): Promise<string>` (fügt in `auth.users` ein, gibt id zurück); `asUser<T>(db, userId: string | null, fn: (tx) => Promise<T>): Promise<T>` – Transaktion mit `set local role authenticated` und `set local request.jwt.claims = '{"sub": "<id>"}'` (bei `null`: Rolle `anon`).
- `auth-stub.sql`: Rollen `anon`, `authenticated` (nologin), Schema `auth`, Tabelle `auth.users(id uuid primary key default gen_random_uuid(), email text)`, Funktion `auth.uid()` liest `request.jwt.claims`→`sub`, `create publication supabase_realtime`, Grants (`usage` auf `public`/`auth`, `select, insert, update, delete` auf alle Tabellen in `public` für `authenticated` per `alter default privileges`).

- [ ] **Step 1: Failing test** (nur `0001`): Als angemeldeter Benutzer lässt sich ein Gerät einfügen und lesen; als `anon` liefert `select * from freezers` 0 Zeilen.
- [ ] **Step 2:** `npx vitest run supabase` → FAIL (Helfer fehlt). **Step 3:** Stub und Helfer anlegen; `npm i -D @electric-sql/pglite`. Falls PGlite `create publication` nicht unterstützt: im Stub stattdessen eine Dummy-Publication-Lösung wählen und als Ruling festhalten. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `test: run SQL migrations against PGlite with a Supabase auth stub`

### Task 2: Migration – Haushalte, Profile, Datenübernahme, Zuordnung

**Files:** Create `supabase/migrations/0002_households.sql`; Modify `supabase/households.test.ts`

**Interfaces:**
- Produces (SQL): Tabellen `households`, `profiles` (Spalten laut Spec); Spalte `household_id` auf `freezers`, `compartments`, `categories`, `items`; Funktion `public.current_household() returns uuid`; Trigger auf `auth.users` (Profil anlegen) und `before insert or update` auf den vier Tabellen (Zuordnung laut Spec, Fehler `Kein Haushalt zugeordnet`, Kategorie-aus-fremdem-Haushalt → Fehler `Kategorie gehört zu einem anderen Haushalt`).
- Datenübernahme laut Spec (Haushalt `Unser Haushalt`, alle Zeilen, alle bestehenden Konten als Mitglieder).

- [ ] **Step 1: Failing tests** (`createDb({ migrations: ['0001'] })`, Daten einfügen: 2 Konten, 1 Gerät, 2 Fächer, 1 eigene Kategorie zusätzlich zu den 9, 3 Lebensmittel; dann `0002` ausführen):
  - Zeilenzahlen in allen vier Tabellen vorher = nachher; alle Zeilen haben denselben `household_id`, dessen Name `Unser Haushalt` ist.
  - Beide Konten haben ein Profil mit diesem Haushalt, `is_admin = false`.
  - Neues Konto nach der Migration → Profil ohne Haushalt.
  - Als Mitglied: `insert into freezers (name) values ('Garage')` (ohne `household_id`) → Zeile hat dessen Haushalt; Fach unter diesem Gerät erbt den Haushalt; Lebensmittel im Fach erbt ihn.
  - Als Konto ohne Haushalt: Gerät anlegen → Fehler `Kein Haushalt zugeordnet`.
- [ ] **Step 2:** → FAIL. **Step 3:** Migration bis einschließlich Trigger schreiben (RLS-Umbau folgt in Task 3; bis dahin bleiben die alten Policies). **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(db): households and profiles with lossless migration of existing data`

### Task 3: Migration – Zugriffsregeln und Admin-Funktionen

**Files:** Modify `supabase/migrations/0002_households.sql`, `supabase/households.test.ts`

**Interfaces:**
- Produces (SQL, RPC): `create_household(name text) returns households`, `rename_household(id uuid, name text) returns void`, `delete_household(id uuid) returns void`, `set_member_household(user_id uuid, household_id uuid) returns void` (`household_id` darf `null` sein), `set_active_household(household_id uuid) returns void`; Admins lesen `households` direkt, die Mitgliederzahl kommt aus `profiles`. Policies laut Spec; alte Policies `authenticated full access` entfernt; `grant execute` auf die Funktionen für `authenticated`.

Testaufbau: Haushalte A („Unser Haushalt“, mit Daten) und B (per `create_household` als Admin angelegt), Mitglied a (A), Mitglied b (B), Admin (A, `is_admin` per Superuser-Update gesetzt), Konto ohne Haushalt.

- [ ] **Step 1: Failing tests:**
  - a sieht nur A-Daten, b nur B-Daten; b kann ein A-Gerät weder ändern noch löschen (0 betroffene Zeilen) und kein Fach in ein A-Gerät einfügen.
  - B hat nach `create_household` genau die 9 Standardkategorien (Namen und Monate).
  - Konto ohne Haushalt sieht 0 Zeilen in allen vier Tabellen (Review Focus 4).
  - Alte App (Review Focus 1): a fügt Gerät/Fach/Lebensmittel ohne `household_id` ein → alles in A.
  - Admin: sieht standardmäßig A; `set_active_household(B)` → sieht nur B, legt Gerät + Lebensmittel an → in B; `set_active_household(null)` → sieht wieder A, A unverändert; `profiles.household_id` des Admins blieb A (Review Focus 2).
  - `set_member_household(a, B)` → a sieht B; Zeilenzahlen von A und B unverändert (Review Focus 3).
  - a ruft `create_household`, `set_member_household`, `set_active_household` → Fehler `Nur für Admins`; a kann `update profiles set is_admin = true` nicht (0 Zeilen oder Fehler).
  - `delete_household(A)` → Fehler mit `noch Mitglieder`; Haushalt C neu angelegt, mit Gerät → `noch Gefriergeräte`; leerer C → gelöscht samt Kategorien.
  - Admin hat C geöffnet, C wird gelöscht → `active_household_id` wird `null`, `current_household()` = A (Review Focus 5).
  - Konto a löschen (`delete from auth.users`) → Profil weg, A-Daten unverändert.
- [ ] **Step 2:** → FAIL. **Step 3:** Policies und Funktionen ergänzen. **Step 4:** `npx vitest run supabase` → PASS.
- [ ] **Step 5: Commit** `feat(db): household row-level security and admin functions`

### Task 4: Datenzugriff in der App (Typen, Interface, In-Memory)

**Files:** Modify `src/domain/types.ts`, `src/data/repository.ts`, `src/data/memoryRepository.ts`, `src/data/memoryRepository.test.ts`, `src/test/renderApp.tsx`

**Interfaces:**
- Produces (`types.ts`): `type HouseholdRef = { id: string; name: string }`; `type Profile = { userId: string; email: string; isAdmin: boolean; household: HouseholdRef | null; activeHousehold: HouseholdRef | null }`; `type HouseholdSummary = HouseholdRef & { memberCount: number }`; `type ProfileSummary = { userId: string; email: string; isAdmin: boolean; householdId: string | null }`.
- Produces (`Repository`): `getProfile(): Promise<Profile | null>`, `listHouseholds(): Promise<HouseholdSummary[]>`, `createHousehold(name: string): Promise<HouseholdRef>`, `renameHousehold(id: string, name: string): Promise<void>`, `deleteHousehold(id: string): Promise<void>` (wirft `Error` mit der Datenbank-Meldung), `listProfiles(): Promise<ProfileSummary[]>`, `setMemberHousehold(userId: string, householdId: string | null): Promise<void>`, `setActiveHousehold(householdId: string | null): Promise<void>`.
- `createMemoryRepository` Seed erweitert um `profile?: Profile` (Standard: Admin `ich@example.de` in Haushalt `Unser Haushalt`, aktiv = eigener) und `households?`, `profiles?`; Geräte/Kategorien/Lebensmittel des Seeds gehören dem eigenen Haushalt; Daten fremder Haushalte werden im Memory-Repo pro Haushalt geführt, damit `setActiveHousehold` die sichtbaren Daten wechselt. `seededRepository` in `renderApp.tsx` bekommt diesen Standard.

- [ ] **Step 1: Failing tests** (Memory-Repo): Standardprofil Admin mit Haushalt; `createHousehold('Müller')` → in `listHouseholds` mit `memberCount` 0; `setActiveHousehold(müller.id)` → `listFreezers()` leer, `listCategories()` = 9 Standardkategorien, `getProfile().activeHousehold.name` = `Müller`; `setActiveHousehold(null)` → wieder eigene Daten; `deleteHousehold` mit Geräten → wirft `Haushalt kann nicht gelöscht werden: noch Gefriergeräte`; `setMemberHousehold` ändert `listProfiles()`.
- [ ] **Step 2:** → FAIL. **Step 3:** Implementieren. **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5: Commit** `feat: household and profile operations in the repository`

### Task 5: Supabase-Anbindung

**Files:** Modify `src/data/supabaseRepository.ts`, `src/data/supabaseRepository.test.ts`

**Interfaces:** Consumes Task 4. `getProfile`: `profiles` (eigene Zeile per `auth.getUser()`-id) + `households` für eigenen/aktiven Haushalt (`activeHousehold` = aktiver, sonst eigener); `listHouseholds`: `households` + Mitgliederzahl aus `profiles`; übrige Methoden als `client.rpc('<funktion>', { … })` mit den SQL-Parameternamen aus Task 3; Datenbankfehler → `Error(message)`.

- [ ] **Step 1: Failing tests** mit einem Fake-Client, der `rpc` aufzeichnet: `createHousehold('Müller')` → `rpc('create_household', { name: 'Müller' })`; `setActiveHousehold(null)` → `rpc('set_active_household', { household_id: null })`; `setMemberHousehold('u1', 'h1')` → `rpc('set_member_household', { user_id: 'u1', household_id: 'h1' })`; Fehler `{ message: 'Haushalt kann nicht gelöscht werden: noch Mitglieder' }` → `deleteHousehold` wirft genau diese Meldung.
- [ ] **Step 2:** → FAIL. **Step 3:** Implementieren. **Step 4:** → PASS; `npx tsc --noEmit` sauber.
- [ ] **Step 5: Commit** `feat: Supabase calls for households`

### Task 6: Profil in der App, Hinweise, Haushaltswechsel

**Files:** Create `src/auth/ProfileContext.tsx`, `src/components/HouseholdBanner.tsx`, `src/pages/NoHouseholdPage.tsx`; Modify `src/App.tsx`, `src/components/Layout.tsx`, Tests (`src/App.test.tsx`, neu `src/components/HouseholdBanner.test.tsx`)

**Interfaces:**
- Produces: `ProfileProvider` (innerhalb `RequireAuth`), `useProfile(): { profile: Profile | null; loading: boolean; switchHousehold(id: string | null): Promise<void>; reload(): Promise<void> }`. Lädt beim Anmelden und bei `visibilitychange` (sichtbar) und `focus` neu; ändert sich `activeHousehold.id`, wird der Seiteninhalt neu gemountet (React-`key` = aktive Haushalts-id) und auf `#/` navigiert, wenn der Wechsel von `switchHousehold` kam.
- Layout: Haushaltsname in der Kopfzeile; Navigationspunkt „Verwaltung“ (`/admin`) nur bei `isAdmin`; `HouseholdBanner` unter der Kopfzeile, wenn `activeHousehold.id !== household?.id`.

- [ ] **Step 1: Failing tests:**
  - Profil ohne Haushalt → nur Text `Dein Konto ist noch keinem Haushalt zugeordnet. Bitte wende dich an den Admin.` und Button „Abmelden“, keine Navigation (Review Focus 4).
  - Admin → Link „Verwaltung“; Mitglied → kein Link.
  - Admin mit fremdem aktivem Haushalt `Müller` → Text `Haushalt: Müller`, Klick `Zurück zu meinem Haushalt` → `setActiveHousehold(null)` aufgerufen, Hinweis weg, Übersicht zeigt eigene Geräte.
  - Profil ändert sich im Hintergrund (Repo-Seed ändern, dann `document.dispatchEvent(new Event('visibilitychange'))`) → Kopfzeile zeigt neuen Haushalt.
- [ ] **Step 2:** → FAIL. **Step 3:** Implementieren. **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5: Commit** `feat: show the active household and let admins switch back`

### Task 7: Verwaltungsseite

**Files:** Create `src/pages/AdminPage.tsx`, `src/pages/AdminPage.test.tsx`; Modify `src/App.tsx` (Route `admin`, nur Admins; Nicht-Admins → `/`), `src/styles.css`

**Verhalten:** Abschnitt „Haushalte“: Liste (Name, Mitgliederzahl, „eigener“-Kennzeichen), Name ändern + „Speichern“, „Öffnen“ (→ `switchHousehold(id)`, dann Übersicht), „Löschen“ (Meldung bei Fehler), neues Feld „Neuer Haushalt“ + „Anlegen“. Abschnitt „Benutzer“: Liste (E-Mail, „Admin“), Auswahl „Haushalt“ mit Option `– keiner –`, Änderung sofort speichern, Hinweistext zum Dashboard.

- [ ] **Step 1: Failing tests:**
  - Haushalt `Müller` anlegen → erscheint mit 0 Mitgliedern.
  - Umbenennen → neuer Name in Liste.
  - Löschen von `Unser Haushalt` (hat Mitglieder) → Meldung `Haushalt kann nicht gelöscht werden: noch Mitglieder`.
  - Benutzer `oma@example.de` (ohne Haushalt) → Auswahl `Müller` → `listProfiles()` zeigt Zuordnung.
  - „Öffnen“ bei `Müller` → Kopfzeile `Haushalt: Müller`, Übersicht ohne Geräte.
  - Admin hat `Müller` geöffnet und löscht ihn (leer) → wieder eigener Haushalt, kein Hinweis (Review Focus 5).
  - Mitglied ruft `#/admin` auf → landet auf der Übersicht.
- [ ] **Step 2:** → FAIL. **Step 3:** Implementieren. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: admin page for households and members`

### Task 8: Demo-Modus, README, Einführungsanleitung, Prüfung

**Files:** Modify `src/data/demoRepository.ts` (+ Test), `README.md`; Create `supabase/check-migration.sql`

- [ ] **Step 1: Failing test:** `createDemoRepository().getProfile()` → `isAdmin: true`, Haushalt `Unser Haushalt`; `listProfiles()` enthält ein zweites Demo-Konto ohne Haushalt.
- [ ] **Step 2:** → FAIL. **Step 3:** Demo anpassen. `check-migration.sql`: Abfragen, die Zeilenzahlen je Tabelle und je Haushalt sowie Zeilen ohne Haushalt (`household_id is null` → muss 0 sein) ausgeben.
- [ ] **Step 4:** README: Abschnitt „Mehrere Haushalte“ (Admin setzen per `update profiles set is_admin = true where email = '<deine E-Mail>';`, Konten anlegen und zuordnen) und „Umstellung auf Haushalte (einmalig)“ mit den 5 Schritten der Spec (CSV-Sicherung, Test-Projekt mit `0001` + Beispieldaten + `0002` + `check-migration.sql`, produktiv `0002`, Admin-Zeile, neue App). Bei Neuinstallation: `0001` und `0002` nacheinander ausführen.
- [ ] **Step 5:** `npx vitest run` → PASS; `npx tsc --noEmit` sauber; `npm run build` erfolgreich. Manuell im Browser (Demo-Modus): Verwaltung anlegen/öffnen/zurück.
- [ ] **Step 6: Commit** `docs: household setup and rollout; demo admin`
