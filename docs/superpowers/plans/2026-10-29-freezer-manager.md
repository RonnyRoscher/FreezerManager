# FreezerManager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine installierbare Web-App (PWA), mit der Gefriergut erfasst, als QR-Label gedruckt, per Scan ausgetragen und nach Kategorie/Alter/Ort überblickt wird – mit gemeinsamem Datenbestand über Supabase.

**Architecture:** React + TypeScript (Vite), Hash-Routing, statisch auf GitHub Pages. Reine Fachlogik in `src/domain/` (ohne React/Supabase), Datenzugriff hinter einer `Repository`-Schnittstelle in `src/data/` mit zwei Implementierungen (In-Memory für Tests, Supabase für Betrieb). Seiten in `src/pages/` hängen nur von der Schnittstelle ab.

**Tech Stack:** Node 22, Vite, React 18, TypeScript, react-router-dom (HashRouter), @supabase/supabase-js v2, qrcode, qr-scanner (nimiq), vite-plugin-pwa, Vitest + @testing-library/react + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-18-freezer-manager-design.md`

## Global Constraints

- Oberfläche komplett auf Deutsch; Code-Bezeichner Englisch.
- Datumswerte für `frozen_at` als `YYYY-MM-DD`-String in **lokaler** Zeit; Anzeige `TT.MM.JJJJ`.
- Vite `base: '/FreezerManager/'`; Routing ausschließlich über `HashRouter` (`#/…`).
- Kurzcode: 4 Zeichen aus `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, max. 5 Erzeugungsversuche bei Unique-Konflikt.
- QR-Inhalt: `<App-Basis-URL>#/take/<item-uuid>`.
- Haltbarkeit: ok / bald (gelb, ab Ablauf − 1 Monat) / überfällig (rot, ab Ablaufdatum).
- Label-Standardgröße 62 × 29 mm, `localStorage`-Key `fm.labelSize`.
- Formular-Voreinstellungen (Kategorie, Gerät, Fach) im `localStorage`-Key `fm.formPrefs`.
- „Rückgängig“-Hinweis nach Entnahme: 8 Sekunden.
- Umgebungsvariablen: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Keine Offline-Datenhaltung; Service Worker cached nur die App-Oberfläche.

## Review Focus

1. **Doppelscan:** Der Scanner meldet denselben QR-Code mehrfach pro Sekunde → es darf nur eine Bestätigungskarte erscheinen und nie zweimal entnommen werden (Test in Task 12).
2. **Manuelle Kurzcode-Eingabe in Kleinbuchstaben/mit Leerzeichen** (`" k7f3 "`) → wird normalisiert und gefunden (Test in Task 5 und Task 12).
3. **Monatsenden:** Eingefroren am 31.08., Haltbarkeit 6 Monate → Ablauf 28./29.02., nicht 03.03. (Test in Task 2).
4. **„Heute“ kurz nach Mitternacht:** `todayIso()` muss lokales Datum liefern, nicht UTC (`toISOString` gäbe um 00:30 MEZ den Vortag) (Test in Task 2).
5. **Speicherfehler im Formular:** Schlägt `createItem` fehl (offline), bleiben alle Eingaben stehen und eine Fehlermeldung erscheint (Test in Task 10).

---

## Dateistruktur

```
index.html
vite.config.ts                 Vite + PWA + Vitest-Konfiguration, base '/FreezerManager/'
src/main.tsx                   Einstieg, wählt Supabase-Repository
src/test/setup.ts              jest-dom, localStorage-Reset
src/domain/types.ts            Datentypen
src/domain/dates.ts            todayIso, addMonths, formatDate
src/domain/expiry.ts           expiryStatus, formatAge
src/domain/shortCode.ts        Alphabet, generateShortCode, normalizeShortCode
src/domain/qrUrl.ts            buildTakeUrl, parseTakeUrl
src/domain/overview.ts         filterItems, sortByAge, groupByCategory
src/data/repository.ts         Repository-Interface, Fehlerklassen
src/data/createWithShortCode.ts  Retry-Logik für eindeutigen Kurzcode
src/data/memoryRepository.ts   In-Memory-Implementierung (Tests)
src/data/supabaseClient.ts     Supabase-Client aus Env
src/data/supabaseRepository.ts Supabase-Implementierung
src/data/RepositoryContext.tsx React-Context + useRepository()
src/auth/AuthContext.tsx       Session-Zustand (über Repository)
src/auth/RequireAuth.tsx       Umleitung zum Login
src/pages/LoginPage.tsx
src/pages/OverviewPage.tsx
src/pages/ItemDetailPage.tsx
src/pages/ItemFormPage.tsx     Neu + Bearbeiten
src/pages/ScanPage.tsx
src/pages/TakePage.tsx
src/pages/SettingsPage.tsx
src/components/Layout.tsx      Navigation
src/components/ItemRow.tsx
src/components/TakeCard.tsx    Bestätigen + Rückgängig
src/components/QrScanner.tsx   Wrapper um qr-scanner
src/components/Label.tsx       Label-Inhalt inkl. QR
src/print/labelSettings.ts     Labelgröße laden/speichern, @page-CSS
src/print/printLabel.tsx       Druckansicht + window.print()
src/lib/formPrefs.ts           Formular-Voreinstellungen
src/App.tsx                    Routen
src/styles.css
supabase/migrations/0001_init.sql
.github/workflows/deploy.yml
README.md
```

Tests liegen jeweils neben der Datei als `*.test.ts(x)`.

---

### Task 1: Projektgerüst

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/test/setup.ts`, `.gitignore`, `src/App.test.tsx`

**Interfaces:**
- Produces: npm-Skripte `dev`, `build` (`tsc --noEmit && vite build`), `test` (`vitest run`); `App` als Default-Export von `src/App.tsx`.

- [ ] **Step 1:** Vite-React-TS-Projekt anlegen (`npm create vite@latest . -- --template react-ts`, dann Beispielinhalte entfernen), Abhängigkeiten installieren: `react-router-dom @supabase/supabase-js qrcode qr-scanner`; dev: `vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @types/qrcode vite-plugin-pwa`.
- [ ] **Step 2:** `vite.config.ts`: `base: '/FreezerManager/'`, Vitest `environment: 'jsdom'`, `setupFiles: ['src/test/setup.ts']`, `globals: true`. `.gitignore` enthält `node_modules`, `dist`, `.env.local`.
- [ ] **Step 3: Failing test** `src/App.test.tsx`: `render(<App />)` (vorerst ohne Provider) und `expect(screen.getByText('FreezerManager')).toBeInTheDocument()`.
- [ ] **Step 4:** `npm test` → FAIL.
- [ ] **Step 5:** `App` rendert `HashRouter` mit Überschrift „FreezerManager“.
- [ ] **Step 6:** `npm test` → PASS; `npm run build` → erfolgreich.
- [ ] **Step 7: Commit** `chore: scaffold Vite React TypeScript app`

### Task 2: Datum & Haltbarkeit

**Files:**
- Create: `src/domain/types.ts`, `src/domain/dates.ts`, `src/domain/expiry.ts`
- Test: `src/domain/dates.test.ts`, `src/domain/expiry.test.ts`

**Interfaces:**
- Produces in `types.ts`:
  ```ts
  type Freezer = { id: string; name: string; sort_order: number };
  type Compartment = { id: string; freezer_id: string; name: string; sort_order: number };
  type FreezerWithCompartments = Freezer & { compartments: Compartment[] };
  type Category = { id: string; name: string; max_months: number };
  type Item = { id: string; short_code: string; name: string; details: string | null;
    quantity: string | null; category_id: string; compartment_id: string;
    frozen_at: string; created_at: string };
  type ItemInput = Omit<Item, 'id' | 'short_code' | 'created_at'>;
  type ItemView = Item & { category: Category; compartment: Compartment; freezer: Freezer };
  type ExpiryStatus = 'ok' | 'soon' | 'overdue';
  ```
- Produces: `todayIso(now?: Date): string`, `addMonths(iso: string, months: number): string`, `formatDate(iso: string): string` (`TT.MM.JJJJ`), `expiryStatus(frozenAt: string, maxMonths: number, today: string): ExpiryStatus`, `formatAge(frozenAt: string, today: string): string`.

- [ ] **Step 1: Failing tests**
  - `todayIso(new Date(2026, 9, 18, 0, 30))` → `'2026-10-18'` (lokal; Review Focus 4).
  - `addMonths('2026-08-31', 6)` → `'2027-02-28'`; `addMonths('2027-08-31', 6)` → `'2028-02-29'`; `addMonths('2026-01-15', 3)` → `'2026-04-15'` (Review Focus 3).
  - `formatDate('2026-10-03')` → `'03.10.2026'`.
  - `expiryStatus('2026-01-01', 6, '2026-05-31')` → `'ok'`; `'2026-06-01'` → `'soon'`; `'2026-06-30'` → `'soon'`; `'2026-07-01'` → `'overdue'`.
  - `formatAge`: gleicher Tag → `'heute'`; 1 Tag → `'vor 1 Tag'`; 20 Tage → `'vor 20 Tagen'`; `('2026-06-18','2026-10-18')` → `'vor 4 Monaten'`; 1 Monat → `'vor 1 Monat'`; `('2025-10-18','2026-10-18')` → `'vor 1 Jahr'`; 26 Monate → `'vor 2 Jahren'`. Regel: < 1 voller Monat → Tage, < 12 volle Monate → Monate, sonst ganze Jahre.
- [ ] **Step 2:** `npx vitest run src/domain` → FAIL.
- [ ] **Step 3:** Implementieren. `addMonths` klemmt den Tag auf den letzten Tag des Zielmonats. `expiryStatus`: `expiry = addMonths(frozenAt, maxMonths)`, `warn = addMonths(frozenAt, maxMonths - 1)`; `today >= expiry` → overdue, `today >= warn` → soon. ISO-Strings sind lexikografisch vergleichbar.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5: Commit** `feat: add date and expiry logic`

### Task 3: Kurzcode & QR-URL

**Files:**
- Create: `src/domain/shortCode.ts`, `src/domain/qrUrl.ts`
- Test: `src/domain/shortCode.test.ts`, `src/domain/qrUrl.test.ts`

**Interfaces:**
- Produces: `SHORT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'`, `generateShortCode(random: () => number = Math.random): string`, `normalizeShortCode(input: string): string` (trim + uppercase), `buildTakeUrl(appBaseUrl: string, id: string): string`, `parseTakeUrl(text: string): string | null`, `appBaseUrl(): string` (= `new URL(import.meta.env.BASE_URL, window.location.origin).href`).

- [ ] **Step 1: Failing tests**
  - `generateShortCode()` 1000× → Länge 4, nur Zeichen aus dem Alphabet; `generateShortCode(() => 0)` → `'AAAA'`.
  - `normalizeShortCode(' k7f3 ')` → `'K7F3'`.
  - `buildTakeUrl('https://x.github.io/FreezerManager/', 'abc')` → `'https://x.github.io/FreezerManager/#/take/abc'`.
  - `parseTakeUrl('https://x.github.io/FreezerManager/#/take/0b9f8c1e-5d1a-4c7e-9a7b-2f1e3d4c5b6a')` → die UUID; `parseTakeUrl('https://example.com')` → `null`; `parseTakeUrl('hallo')` → `null`; `parseTakeUrl('…/#/take/keine-uuid')` → `null`.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren; `parseTakeUrl` per Regex `/#\/take\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i`.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5: Commit** `feat: add short code and QR URL helpers`

### Task 4: Übersichtslogik

**Files:**
- Create: `src/domain/overview.ts`
- Test: `src/domain/overview.test.ts`

**Interfaces:**
- Consumes: `ItemView` (Task 2).
- Produces: `filterItems(items: ItemView[], f: { freezerId?: string; query?: string }): ItemView[]`, `sortByAge(items: ItemView[]): ItemView[]`, `groupByCategory(items: ItemView[]): { category: Category; items: ItemView[] }[]`.

- [ ] **Step 1: Failing tests** (Testdaten-Fabrik `makeItem(partial)` im Test):
  - `filterItems` mit `freezerId` liefert nur Einträge dieses Geräts; `query: 'hack'` findet „Hackfleisch“ (Name, case-insensitive), `query: 'bolognese'` findet über `details`, `query: 'k7f3'` findet `short_code: 'K7F3'`; leere Query → alle.
  - `sortByAge`: älteste `frozen_at` zuerst, bei Gleichstand nach `name`; Eingabe-Array bleibt unverändert.
  - `groupByCategory`: Gruppen alphabetisch nach Kategoriename (`localeCompare('de')`), innerhalb nach Alter; Kategorien ohne Einträge erscheinen nicht.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5: Commit** `feat: add overview filtering and grouping`

### Task 5: Repository-Schnittstelle & In-Memory-Implementierung

**Files:**
- Create: `src/data/repository.ts`, `src/data/createWithShortCode.ts`, `src/data/memoryRepository.ts`
- Test: `src/data/createWithShortCode.test.ts`, `src/data/memoryRepository.test.ts`

**Interfaces:**
- Produces in `repository.ts`:
  ```ts
  class InUseError extends Error { constructor(public count: number) }
  class DuplicateShortCodeError extends Error {}
  type Session = { email: string } | null;
  interface Repository {
    getSession(): Promise<Session>;
    signIn(email: string, password: string): Promise<void>;   // wirft Error bei falschen Daten
    signOut(): Promise<void>;
    onAuthChange(cb: (s: Session) => void): () => void;
    listItems(): Promise<ItemView[]>;
    getItem(id: string): Promise<ItemView | null>;
    findItemByShortCode(code: string): Promise<ItemView | null>;  // normalisiert intern
    listItemNames(): Promise<string[]>;                          // eindeutig, sortiert
    createItem(input: ItemInput): Promise<Item>;
    updateItem(id: string, input: ItemInput): Promise<Item>;
    removeItem(id: string): Promise<Item | null>;                // null = nicht (mehr) vorhanden
    restoreItem(item: Item): Promise<void>;                      // gleiche id + short_code
    subscribeItems(onChange: () => void): () => void;
    listFreezers(): Promise<FreezerWithCompartments[]>;          // sortiert nach sort_order
    saveFreezer(f: { id?: string; name: string; sort_order: number }): Promise<Freezer>;
    deleteFreezer(id: string): Promise<void>;                    // InUseError wenn Einträge
    saveCompartment(c: { id?: string; freezer_id: string; name: string; sort_order: number }): Promise<Compartment>;
    deleteCompartment(id: string): Promise<void>;                // InUseError wenn Einträge
    listCategories(): Promise<Category[]>;                       // nach Name
    saveCategory(c: { id?: string; name: string; max_months: number }): Promise<Category>;
    deleteCategory(id: string): Promise<void>;                   // InUseError wenn Einträge
  }
  ```
- Produces: `createWithShortCode<T>(insert: (code: string) => Promise<T>, generate?: () => string): Promise<T>` – fängt `DuplicateShortCodeError`, max. 5 Versuche, danach Fehler weiterwerfen.
- Produces: `createMemoryRepository(seed?: { freezers?, compartments?, categories?, items?, session? }): Repository`. `signIn` akzeptiert jedes Passwort außer `'falsch'`.

- [ ] **Step 1: Failing tests** für `createWithShortCode`: Generator liefert `['AAAA','AAAA','BBBB']`, `insert` wirft bei `AAAA` `DuplicateShortCodeError` → Ergebnis mit `BBBB`, `insert` 3× aufgerufen; immer Duplikat → wirft nach 5 Aufrufen.
- [ ] **Step 2: Failing tests** für das Memory-Repository:
  - `createItem` → `listItems` enthält `ItemView` mit aufgelöster `category`, `compartment`, `freezer`; `short_code` passt zum Alphabet.
  - `removeItem(id)` gibt den Datensatz zurück; zweiter Aufruf → `null`.
  - `restoreItem(removed)` → `getItem(id)` liefert wieder Eintrag mit gleichem `short_code`.
  - `findItemByShortCode(' k7f3 ')` findet `K7F3` (Review Focus 2).
  - `deleteCompartment` mit 2 Einträgen → `InUseError` mit `count === 2`; `deleteFreezer` analog über alle seine Fächer; ohne Einträge löscht `deleteFreezer` auch dessen Fächer; `deleteCategory` analog.
  - `subscribeItems`-Callback wird nach `createItem`, `updateItem`, `removeItem`, `restoreItem` aufgerufen; Rückgabefunktion meldet ab.
- [ ] **Step 3:** Tests → FAIL.
- [ ] **Step 4:** Implementieren (`crypto.randomUUID()` für IDs).
- [ ] **Step 5:** Tests → PASS.
- [ ] **Step 6: Commit** `feat: add repository interface and in-memory implementation`

### Task 6: Supabase – Schema & Repository

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `src/data/supabaseClient.ts`, `src/data/supabaseRepository.ts`

**Interfaces:**
- Consumes: `Repository`, Fehlerklassen, `createWithShortCode` (Task 5).
- Produces: `createSupabaseRepository(client: SupabaseClient): Repository`; `supabase` (Client aus `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`).

- [ ] **Step 1:** Migration schreiben:
  - Tabellen gemäß Spec (`gen_random_uuid()` Defaults, `items.short_code` unique, `items.frozen_at date not null`, `created_at timestamptz default now()`).
  - `compartments.freezer_id … on delete cascade`; `items.category_id`/`items.compartment_id … on delete restrict`.
  - RLS auf allen vier Tabellen aktiv; je Tabelle Policy `for all to authenticated using (true) with check (true)`.
  - `alter publication supabase_realtime add table items;`
  - Standardkategorien: Fleisch 6, Geflügel 6, Fisch 4, Gemüse 12, Obst 12, Brot & Backwaren 3, Fertiggerichte 3, Suppen & Soßen 4, Sonstiges 6.
- [ ] **Step 2:** Repository implementieren:
  - Items laden mit `select('*, category:categories(*), compartment:compartments(*, freezer:freezers(*))')` und in `ItemView` abbilden (`freezer` aus `compartment.freezer` herausziehen).
  - Postgres-Fehlercode `23505` auf `short_code` → `DuplicateShortCodeError`.
  - `delete*`: vorher `count` der betroffenen Items abfragen (`select('id', { count: 'exact', head: true })`), bei > 0 `InUseError(count)`.
  - `removeItem`: `delete().eq('id', id).select().maybeSingle()` → `null`, wenn nichts gelöscht.
  - `subscribeItems`: Channel `items-changes` auf `postgres_changes` `event: '*'`, Rückgabe entfernt den Channel.
  - Auth über `client.auth.signInWithPassword`, `getSession`, `onAuthStateChange`, `signOut`.
- [ ] **Step 3:** `npm run build` → erfolgreich (Typprüfung).
- [ ] **Step 4: Commit** `feat: add Supabase schema and repository`

### Task 7: Auth, Routing & Layout

**Files:**
- Create: `src/data/RepositoryContext.tsx`, `src/auth/AuthContext.tsx`, `src/auth/RequireAuth.tsx`, `src/pages/LoginPage.tsx`, `src/components/Layout.tsx`, `src/test/renderApp.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`, `src/App.test.tsx`

**Interfaces:**
- Produces: `RepositoryProvider({ repo, children })`, `useRepository(): Repository`; `AuthProvider`, `useAuth(): { session: Session; loading: boolean }`; `App({ repo }: { repo: Repository })`.
- Produces (Test-Helfer): `renderApp(route: string, repo = createMemoryRepository(...))` – setzt `window.location.hash = route` und rendert `<App repo={repo} />`.
- Routen: `/login`, `/` Übersicht, `/new`, `/item/:id`, `/item/:id/edit`, `/scan`, `/take/:id`, `/settings`. Bis die Seiten existieren, rendern die Routen Platzhalter mit dem Seitentitel.

- [ ] **Step 1: Failing tests** in `App.test.tsx`:
  - Ohne Session: `renderApp('#/take/abc')` zeigt Login-Formular („E-Mail“, „Passwort“, Button „Anmelden“).
  - Login mit gültigen Daten → landet auf `#/take/abc` (ursprüngliche Route, Spec „Session abgelaufen“).
  - Login mit Passwort `'falsch'` → „Anmeldung fehlgeschlagen“.
  - Mit Session: Navigation zeigt „Übersicht“, „Scannen“, „Einfrieren“, „Einstellungen“.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren. `RequireAuth` leitet auf `/login` mit `state: { from: location }` um. `main.tsx` erzeugt `createSupabaseRepository(supabase)`. `Layout`: untere Tab-Leiste unter 700 px Breite, sonst obere Leiste (reines CSS).
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5: Commit** `feat: add login, protected routes and navigation`

### Task 8: Einstellungen

**Files:**
- Create: `src/pages/SettingsPage.tsx`, `src/print/labelSettings.ts`
- Test: `src/pages/SettingsPage.test.tsx`, `src/print/labelSettings.test.ts`

**Interfaces:**
- Produces: `type LabelSize = { widthMm: number; heightMm: number }`, `DEFAULT_LABEL_SIZE = { widthMm: 62, heightMm: 29 }`, `loadLabelSize(): LabelSize`, `saveLabelSize(s: LabelSize): void`, `pageCss(s: LabelSize): string` (→ `'@page { size: 62mm 29mm; margin: 0 }'`).

- [ ] **Step 1: Failing tests** `labelSettings`: ohne Eintrag → Default; nach `saveLabelSize({widthMm: 54, heightMm: 25})` → geladen; kaputtes JSON im Storage → Default; `pageCss` liefert exakt den String oben.
- [ ] **Step 2: Failing tests** `SettingsPage` (Memory-Repo):
  - Gerät „Keller-Truhe“ anlegen → erscheint in Liste; Fach „Schublade 1“ darunter anlegen → erscheint.
  - Umbenennen eines Fachs per Eingabefeld + „Speichern“.
  - Reihenfolge: Buttons „nach oben“/„nach unten“ ändern `sort_order`.
  - Fach mit 2 Einträgen löschen → Meldung „Kann nicht gelöscht werden: 2 Einträge vorhanden“.
  - Kategorie „Eis“ mit 2 Monaten anlegen; Haltbarkeit ändern.
  - Labelgröße ändern → `loadLabelSize()` liefert neuen Wert.
- [ ] **Step 3:** Tests → FAIL.
- [ ] **Step 4:** Implementieren (drei Abschnitte: „Gefriergeräte“, „Kategorien“, „Label“).
- [ ] **Step 5:** Tests → PASS.
- [ ] **Step 6: Commit** `feat: add settings for freezers, categories and label size`

### Task 9: Label & Druck

**Files:**
- Create: `src/components/Label.tsx`, `src/print/printLabel.tsx`
- Modify: `src/styles.css`
- Test: `src/components/Label.test.tsx`, `src/print/printLabel.test.tsx`

**Interfaces:**
- Consumes: `buildTakeUrl`, `appBaseUrl` (Task 3), `formatDate` (Task 2), `loadLabelSize`, `pageCss` (Task 8).
- Produces: `Label({ item, size }: { item: ItemView; size: LabelSize })`, `printLabel(item: ItemView): Promise<void>`.

- [ ] **Step 1: Failing tests:**
  - `Label` zeigt Name, „500 g · mit Zwiebeln“ (Menge · Details; fehlende Teile ohne Trennpunkt), Kategoriename, `03.10.2026`, „Keller-Truhe › Schublade 2“, Kurzcode; enthält ein `<img>`/`<svg>` mit QR (QR-Daten per `QRCode.toDataURL(buildTakeUrl(...))` – im Test prüft ein Mock von `qrcode`, dass die Take-URL mit der Item-ID übergeben wurde).
  - `printLabel` hängt einen Container `#print-root` mit Label und `<style>` mit `pageCss(loadLabelSize())` an, ruft `window.print` auf und entfernt den Container nach `afterprint`.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren. Layout in mm: Label `width/height` aus `size`; QR-Höhe = `heightMm − 2`; Name fett, eine Zeile mit Ellipse; `@media print` blendet alles außer `#print-root` aus.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5:** Manuelle Prüfung erfolgt nach Task 10 („Speichern & Label drucken“ → Druckvorschau zeigt genau ein Label 62 × 29 mm).
- [ ] **Step 6: Commit** `feat: add printable QR label`

### Task 10: Einfrieren & Bearbeiten

**Files:**
- Create: `src/pages/ItemFormPage.tsx`, `src/lib/formPrefs.ts`
- Test: `src/pages/ItemFormPage.test.tsx`, `src/lib/formPrefs.test.ts`

**Interfaces:**
- Consumes: `todayIso` (Task 2), Repository (Task 5), `printLabel` (Task 9).
- Produces: `type FormPrefs = { categoryId?: string; freezerId?: string; compartmentId?: string }`, `loadFormPrefs(): FormPrefs`, `saveFormPrefs(p: FormPrefs): void`.

- [ ] **Step 1: Failing tests:**
  - Neu: Einfrierdatum ist mit `todayIso()` vorbelegt; Fach-Auswahl zeigt nur Fächer des gewählten Geräts.
  - Pflichtfelder Name, Kategorie, Gerät, Fach, Datum: ohne Name → „Bitte Namen angeben“, kein `createItem`.
  - Speichern → Eintrag im Repo; Formular leert Name/Details/Menge, Kategorie/Gerät/Fach bleiben gewählt und stehen auch nach erneutem Rendern (`fm.formPrefs`) vorausgewählt; Hinweis „Gespeichert: <Name> (<Kurzcode>)“.
  - Namensvorschläge: `<datalist>` enthält Namen aus `listItemNames()`.
  - „Speichern & Label drucken“ ruft `printLabel` mit dem neuen `ItemView` auf.
  - Bearbeiten (`#/item/:id/edit`): Felder vorbefüllt, Speichern ruft `updateItem`, danach Navigation zu `#/item/:id`.
  - **Review Focus 5:** `createItem` wirft → „Speichern fehlgeschlagen. Bitte Verbindung prüfen.“, alle Eingaben bleiben erhalten.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5:** Manuelle Prüfung: `npm run dev`, Eintrag anlegen, „Speichern & Label drucken“ → Druckvorschau zeigt genau ein Label 62 × 29 mm.
- [ ] **Step 6: Commit** `feat: add freeze and edit form`

### Task 11: Übersicht & Detail

**Files:**
- Create: `src/pages/OverviewPage.tsx`, `src/pages/ItemDetailPage.tsx`, `src/components/ItemRow.tsx`
- Test: `src/pages/OverviewPage.test.tsx`, `src/pages/ItemDetailPage.test.tsx`

**Interfaces:**
- Consumes: `filterItems`, `sortByAge`, `groupByCategory` (Task 4), `expiryStatus`, `formatAge`, `todayIso` (Task 2), `printLabel` (Task 9), `TakeCard` (Task 12 – Detail-Entnahme wird dort verdrahtet; bis dahin Button „Entnehmen“ → `#/take/:id`).
- Produces: `ItemRow({ item, today })` mit CSS-Klasse `status-ok|status-soon|status-overdue`.

- [ ] **Step 1: Failing tests:**
  - Standardansicht „nach Kategorie“: Überschriften je Kategorie; Umschalter „nach Alter“ zeigt flache Liste, ältester Eintrag zuerst; Wahl wird in `localStorage` (`fm.overviewMode`) gemerkt.
  - Zeile zeigt Name, Menge, „Keller-Truhe › Schublade 2“, „vor 4 Monaten“; überfälliger Eintrag hat Klasse `status-overdue`.
  - Gerätefilter und Suche wirken (Suche nach Kurzcode).
  - Leerer Bestand → „Noch nichts eingefroren.“
  - Realtime: `subscribeItems`-Callback auslösen nach externem `createItem` → neuer Eintrag erscheint.
  - Detail: zeigt alle Felder inkl. Ablaufdatum; Buttons „Bearbeiten“, „Label drucken“, „Entnehmen“; unbekannte ID → „Nicht (mehr) im Bestand“.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren; Ladefehler → „Daten konnten nicht geladen werden.“ mit Button „Erneut versuchen“.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5: Commit** `feat: add overview and item detail`

### Task 12: Entnehmen, Scannen & Rückgängig

**Files:**
- Create: `src/components/TakeCard.tsx`, `src/components/QrScanner.tsx`, `src/pages/TakePage.tsx`, `src/pages/ScanPage.tsx`
- Modify: `src/pages/ItemDetailPage.tsx`
- Test: `src/components/TakeCard.test.tsx`, `src/pages/TakePage.test.tsx`, `src/pages/ScanPage.test.tsx`

**Interfaces:**
- Consumes: `parseTakeUrl`, `normalizeShortCode` (Task 3), Repository.
- Produces: `TakeCard({ item, onDone }: { item: ItemView; onDone?: () => void })` – Button „Entnehmen“ → `removeItem`, danach „<Name> entnommen“ + Button „Rückgängig“ für 8 s (`restoreItem`), dann `onDone`. `QrScanner({ onResult, onError }: { onResult: (text: string) => void; onError: (e: Error) => void })` – kapselt `qr-scanner`, in Tests per `vi.mock` ersetzt.

- [ ] **Step 1: Failing tests:**
  - `TakeCard`: „Entnehmen“ → Eintrag weg; „Rückgängig“ → Eintrag mit gleicher ID wieder da; nach 8 s (Fake Timers) verschwindet der Hinweis und `onDone` wird gerufen. `removeItem` liefert `null` → „Nicht (mehr) im Bestand“.
  - `TakePage` (`#/take/<id>`): zeigt Details + `TakeCard`; unbekannte ID → „Nicht (mehr) im Bestand“ + Link „Zur Übersicht“.
  - `ScanPage`: gemockter Scanner meldet Take-URL → Karte mit Name und Ort; fremder Text → keine Reaktion.
  - **Review Focus 1:** Scanner meldet dieselbe URL 5× hintereinander → genau eine Karte; nach Entnahme und Ablauf des Hinweises wird dieselbe URL erneut gemeldet → „Nicht (mehr) im Bestand“, `removeItem` insgesamt nur 1× aufgerufen.
  - Manuelle Eingabe `' k7f3 '` + „Suchen“ → Karte für `K7F3` (Review Focus 2).
  - Scanner `onError` (Kamera verweigert) → „Kamera nicht verfügbar. Kurzcode manuell eingeben.“ und Eingabefeld sichtbar.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren. `ScanPage` ignoriert Ergebnisse, solange eine Karte offen ist, und dieselbe ID innerhalb von 3 s nach Schließen der Karte. Detailseite nutzt `TakeCard` und navigiert nach `onDone` zur Übersicht.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5:** Manuelle Prüfung am Handy (nach Deployment, Task 13): Scan mit System-Kamera öffnet Entnahme-Seite; In-App-Scanner trägt aus.
- [ ] **Step 6: Commit** `feat: add scan-to-remove with undo`

### Task 13: PWA, Deployment & README

**Files:**
- Modify: `vite.config.ts`
- Create: `public/icon-192.png`, `public/icon-512.png`, `.github/workflows/deploy.yml`, `README.md`, `.env.example`

- [ ] **Step 1:** `vite-plugin-pwa` konfigurieren: `registerType: 'autoUpdate'`, Manifest `name: 'FreezerManager'`, `short_name: 'Gefrierfach'`, `lang: 'de'`, `display: 'standalone'`, `start_url`/`scope: '/FreezerManager/'`, Icons; Workbox cached nur Build-Assets (keine Runtime-Caching-Regel für Supabase).
- [ ] **Step 2:** Workflow: Trigger `push` auf `main` + `workflow_dispatch`; Node 22, `npm ci`, `npm test`, `npm run build` mit Secrets `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; `actions/upload-pages-artifact` (`dist`) + `actions/deploy-pages`.
- [ ] **Step 3:** README (Deutsch): Funktionsüberblick; Einrichtung Supabase (Projekt EU, SQL aus `supabase/migrations/0001_init.sql` ausführen, Nutzer unter Authentication anlegen, „Allow new users to sign up“ deaktivieren); GitHub-Secrets; Pages-Quelle „GitHub Actions“; Druckertreiber auf Etikettenformat 62 × 29 mm stellen, Ränder „Keine“, Skalierung 100 %; App am Handy zum Startbildschirm hinzufügen; lokale Entwicklung mit `.env.local`; manuelle Prüf-Checkliste (Druck, Kamera-Scan, System-Kamera-Scan, Sync PC↔Handy).
- [ ] **Step 4:** `npm test` → alle PASS; `npm run build` → erfolgreich, `dist/manifest.webmanifest` vorhanden.
- [ ] **Step 5: Commit** `chore: add PWA manifest, Pages deployment and README`
