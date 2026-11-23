// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser, applyMigration } from '../src/test/supabaseDb';

describe('SQL test harness (0001 only)', () => {
  it('lets a signed-in user insert and read a freezer', async () => {
    const db = await createDb({ migrations: ['0001'] });
    const uid = await addUser(db, 'a@example.com');
    const rows = await asUser(db, uid, async (tx) => {
      await tx.query("insert into freezers (name) values ('Keller')");
      const r = await tx.query<{ name: string }>('select name from freezers');
      return r.rows;
    });
    expect(rows).toEqual([{ name: 'Keller' }]);
  });

  it('shows anon no freezers', async () => {
    const db = await createDb({ migrations: ['0001'] });
    const uid = await addUser(db, 'a@example.com');
    await asUser(db, uid, (tx) => tx.query("insert into freezers (name) values ('Keller')"));
    const rows = await asUser(db, null, async (tx) => (await tx.query('select * from freezers')).rows);
    expect(rows).toHaveLength(0);
  });
});

describe('SQL test harness (role switching)', () => {
  it('runs asUser as the non-superuser role authenticated', async () => {
    const db = await createDb({ migrations: ['0001'] });
    const uid = await addUser(db, 'a@example.com');
    const row = await asUser(db, uid, async (tx) => {
      const r = await tx.query<{ current_user: string; rolsuper: boolean }>(
        'select current_user, (select rolsuper from pg_roles where rolname = current_user) as rolsuper',
      );
      return r.rows[0];
    });
    expect(row).toEqual({ current_user: 'authenticated', rolsuper: false });
  });
});

type Db = Awaited<ReturnType<typeof createDb>>;

async function count(db: Db, table: string): Promise<number> {
  const r = await db.query<{ n: number }>(`select count(*)::int as n from ${table}`);
  return r.rows[0].n;
}

/** 0001 plus existing production-like data: 2 accounts, 1 freezer, 2 compartments, 1 extra category, 3 items. */
async function seededLegacyDb() {
  const db = await createDb({ migrations: ['0001'] });
  const userA = await addUser(db, 'a@example.com');
  const userB = await addUser(db, 'b@example.com');
  const freezer = (await db.query<{ id: string }>("insert into freezers (name) values ('Keller') returning id")).rows[0].id;
  const c1 = (
    await db.query<{ id: string }>("insert into compartments (freezer_id, name) values ($1, 'Fach 1') returning id", [freezer])
  ).rows[0].id;
  const c2 = (
    await db.query<{ id: string }>("insert into compartments (freezer_id, name) values ($1, 'Fach 2') returning id", [freezer])
  ).rows[0].id;
  const cat = (
    await db.query<{ id: string }>("insert into categories (name, max_months) values ('Eis', 2) returning id")
  ).rows[0].id;
  const fleisch = (await db.query<{ id: string }>("select id from categories where name = 'Fleisch'")).rows[0].id;
  await db.query(
    `insert into items (short_code, name, category_id, compartment_id, frozen_at) values
       ('A1', 'Gulasch', $1, $3, '2026-10-01'),
       ('A2', 'Vanilleeis', $2, $3, '2026-10-02'),
       ('A3', 'Hackfleisch', $1, $4, '2026-10-03')`,
    [fleisch, cat, c1, c2],
  );
  return { db, userA, userB };
}

const TABLES = ['freezers', 'compartments', 'categories', 'items'] as const;

describe('0002 data takeover', () => {
  it('keeps every row and assigns all of them to "Unser Haushalt"', async () => {
    const { db } = await seededLegacyDb();
    const before = Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await count(db, t)])));
    expect(before).toEqual({ freezers: 1, compartments: 2, categories: 10, items: 3 });

    await applyMigration(db, '0002');

    for (const t of TABLES) expect(await count(db, t)).toBe(before[t]);
    const ids = await db.query<{ household_id: string }>(
      TABLES.map((t) => `select household_id from ${t}`).join(' union '),
    );
    expect(ids.rows).toHaveLength(1);
    const hh = await db.query<{ name: string }>('select name from households where id = $1', [ids.rows[0].household_id]);
    expect(hh.rows).toEqual([{ name: 'Unser Haushalt' }]);
    expect(await count(db, 'households')).toBe(1);
  });

  it('gives every existing account a profile in that household, not admin', async () => {
    const { db, userA, userB } = await seededLegacyDb();
    await applyMigration(db, '0002');
    const r = await db.query<{ user_id: string; email: string; name: string; is_admin: boolean }>(
      `select p.user_id, p.email, h.name, p.is_admin
         from profiles p join households h on h.id = p.household_id order by p.email`,
    );
    expect(r.rows).toEqual([
      { user_id: userA, email: 'a@example.com', name: 'Unser Haushalt', is_admin: false },
      { user_id: userB, email: 'b@example.com', name: 'Unser Haushalt', is_admin: false },
    ]);
  });

  it('creates a profile without household for accounts added later', async () => {
    const { db } = await seededLegacyDb();
    await applyMigration(db, '0002');
    const uid = await addUser(db, 'c@example.com');
    const r = await db.query('select email, household_id, active_household_id, is_admin from profiles where user_id = $1', [
      uid,
    ]);
    expect(r.rows).toEqual([{ email: 'c@example.com', household_id: null, active_household_id: null, is_admin: false }]);
  });

  it('deleting an account removes only its profile', async () => {
    const { db, userA } = await seededLegacyDb();
    await applyMigration(db, '0002');
    await db.query('delete from auth.users where id = $1', [userA]);
    expect(await count(db, 'profiles')).toBe(1);
    expect(await count(db, 'households')).toBe(1);
    expect(await count(db, 'items')).toBe(3);
  });
});

describe('0002 household assignment of new rows', () => {
  it('assigns the member household to new freezers, compartments and items', async () => {
    const { db, userA } = await seededLegacyDb();
    await applyMigration(db, '0002');
    const hh = (await db.query<{ id: string }>('select id from households')).rows[0].id;
    const got = await asUser(db, userA, async (tx) => {
      const f = (await tx.query<{ id: string; household_id: string }>(
        "insert into freezers (name) values ('Garage') returning id, household_id",
      )).rows[0];
      const c = (await tx.query<{ id: string; household_id: string }>(
        "insert into compartments (freezer_id, name) values ($1, 'Oben') returning id, household_id",
        [f.id],
      )).rows[0];
      const cat = (await tx.query<{ id: string }>("select id from categories where name = 'Fisch'")).rows[0].id;
      const i = (await tx.query<{ household_id: string }>(
        `insert into items (short_code, name, category_id, compartment_id, frozen_at)
           values ('G1', 'Lachs', $1, $2, '2026-11-01') returning household_id`,
        [cat, c.id],
      )).rows[0];
      return [f.household_id, c.household_id, i.household_id];
    });
    expect(got).toEqual([hh, hh, hh]);
  });

  it('assigns the member household to new categories', async () => {
    const { db, userA } = await seededLegacyDb();
    await applyMigration(db, '0002');
    const hh = (await db.query<{ id: string }>('select id from households')).rows[0].id;
    const r = await asUser(db, userA, (tx) =>
      tx.query<{ household_id: string }>("insert into categories (name, max_months) values ('Kuchen', 3) returning household_id"),
    );
    expect(r.rows[0].household_id).toBe(hh);
  });

  it('rejects new rows from an account without household', async () => {
    const { db } = await seededLegacyDb();
    await applyMigration(db, '0002');
    const uid = await addUser(db, 'c@example.com');
    await expect(asUser(db, uid, (tx) => tx.query("insert into freezers (name) values ('Garage')"))).rejects.toThrow(
      'Kein Haushalt zugeordnet',
    );
    await expect(
      asUser(db, uid, (tx) => tx.query("insert into categories (name, max_months) values ('Kuchen', 3)")),
    ).rejects.toThrow('Kein Haushalt zugeordnet');
  });

  it('rejects items whose category belongs to another household, on insert and update', async () => {
    const { db, userA } = await seededLegacyDb();
    await applyMigration(db, '0002');
    const other = (await db.query<{ id: string }>("insert into households (name) values ('Andere') returning id")).rows[0].id;
    const foreignCat = (await db.query<{ id: string }>(
      "insert into categories (name, max_months, household_id) values ('Fremd', 3, $1) returning id",
      [other],
    )).rows[0].id;
    const comp = (await db.query<{ id: string }>("select id from compartments where name = 'Fach 1'")).rows[0].id;
    await expect(
      asUser(db, userA, (tx) =>
        tx.query(
          `insert into items (short_code, name, category_id, compartment_id, frozen_at)
             values ('X1', 'X', $1, $2, '2026-11-01')`,
          [foreignCat, comp],
        ),
      ),
    ).rejects.toThrow('Kategorie gehört zu einem anderen Haushalt');
    await expect(
      asUser(db, userA, (tx) => tx.query("update items set category_id = $1 where short_code = 'A1'", [foreignCat])),
    ).rejects.toThrow('Kategorie gehört zu einem anderen Haushalt');
  });

  it('moves an item to the household of its new compartment on update', async () => {
    const { db } = await seededLegacyDb();
    await applyMigration(db, '0002');
    const other = (await db.query<{ id: string }>("insert into households (name) values ('Andere') returning id")).rows[0].id;
    const f = (await db.query<{ id: string }>(
      "insert into freezers (name, household_id) values ('Fremd', $1) returning id",
      [other],
    )).rows[0].id;
    const c = (await db.query<{ id: string; household_id: string }>(
      "insert into compartments (freezer_id, name) values ($1, 'F') returning id, household_id",
      [f],
    )).rows[0];
    expect(c.household_id).toBe(other);
    const cat = (await db.query<{ id: string }>(
      "insert into categories (name, max_months, household_id) values ('Fremd', 3, $1) returning id",
      [other],
    )).rows[0].id;
    const r = await db.query<{ household_id: string }>(
      "update items set compartment_id = $1, category_id = $2 where short_code = 'A1' returning household_id",
      [c.id, cat],
    );
    expect(r.rows[0].household_id).toBe(other);
  });

  it('keeps the household of existing freezers and categories on update', async () => {
    const { db, userA } = await seededLegacyDb();
    await applyMigration(db, '0002');
    const hh = (await db.query<{ id: string }>('select id from households')).rows[0].id;
    const r = await asUser(db, userA, async (tx) => [
      (await tx.query<{ household_id: string }>("update freezers set name = 'Keller 2' returning household_id")).rows[0],
      (await tx.query<{ household_id: string }>("update categories set max_months = 7 where name = 'Fleisch' returning household_id")).rows[0],
    ]);
    expect(r).toEqual([{ household_id: hh }, { household_id: hh }]);
  });
});

describe('current_household()', () => {
  it('returns household_id for members and the active household for admins', async () => {
    const { db, userA, userB } = await seededLegacyDb();
    await applyMigration(db, '0002');
    const hh = (await db.query<{ id: string }>('select id from households')).rows[0].id;
    const other = (await db.query<{ id: string }>("insert into households (name) values ('Andere') returning id")).rows[0].id;
    await db.query('update profiles set active_household_id = $1', [other]);
    await db.query('update profiles set is_admin = true where user_id = $1', [userB]);
    const q = (uid: string | null) =>
      asUser(db, uid, async (tx) => (await tx.query<{ h: string | null }>('select current_household() as h')).rows[0].h);
    expect(await q(userA)).toBe(hh); // non-admin ignores active_household_id
    expect(await q(userB)).toBe(other);
    await db.query('update profiles set active_household_id = null where user_id = $1', [userB]);
    expect(await q(userB)).toBe(hh);
    expect(await q(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Access rules and admin functions
// ---------------------------------------------------------------------------

const DEFAULT_CATEGORIES = [
  { name: 'Fleisch', max_months: 6 },
  { name: 'Geflügel', max_months: 6 },
  { name: 'Fisch', max_months: 4 },
  { name: 'Gemüse', max_months: 12 },
  { name: 'Obst', max_months: 12 },
  { name: 'Brot & Backwaren', max_months: 3 },
  { name: 'Fertiggerichte', max_months: 3 },
  { name: 'Suppen & Soßen', max_months: 4 },
  { name: 'Sonstiges', max_months: 6 },
];

const byName = <T extends { name: string }>(rows: T[]) => [...rows].sort((x, y) => x.name.localeCompare(y.name));

/** Row counts of the four data tables for one household (as superuser). */
async function snapshot(db: Db, household: string) {
  const out: Record<string, number> = {};
  for (const t of TABLES) {
    const r = await db.query<{ n: number }>(`select count(*)::int as n from ${t} where household_id = $1`, [household]);
    out[t] = r.rows[0].n;
  }
  return out;
}

/** Distinct household ids of all rows the user can see in the four data tables, and the row count. */
async function visible(db: Db, uid: string | null) {
  return asUser(db, uid, async (tx) => {
    const r = await tx.query<{ household_id: string }>(
      TABLES.map((t) => `select household_id from ${t}`).join(' union all '),
    );
    return { households: [...new Set(r.rows.map((x) => x.household_id))], rows: r.rows.length };
  });
}

/**
 * A ("Unser Haushalt", legacy data) with member a and the admin; B created by the admin via
 * create_household, member b with a freezer, compartment and item in B; an account without household.
 */
async function householdsDb() {
  const { db, userA: a, userB: admin } = await seededLegacyDb();
  await applyMigration(db, '0002');
  await db.query('update profiles set is_admin = true where user_id = $1', [admin]);
  const A = (await db.query<{ id: string }>("select id from households where name = 'Unser Haushalt'")).rows[0].id;
  const B = await asUser(db, admin, async (tx) =>
    (await tx.query<{ id: string }>("select id from create_household('Zweiter Haushalt')")).rows[0].id,
  );
  const b = await addUser(db, 'member-b@example.com');
  await db.query('update profiles set household_id = $1 where user_id = $2', [B, b]);
  const none = await addUser(db, 'none@example.com');
  await asUser(db, b, async (tx) => {
    const f = (await tx.query<{ id: string }>("insert into freezers (name) values ('B-Truhe') returning id")).rows[0].id;
    const c = (await tx.query<{ id: string }>(
      "insert into compartments (freezer_id, name) values ($1, 'B-Fach') returning id",
      [f],
    )).rows[0].id;
    const cat = (await tx.query<{ id: string }>("select id from categories where name = 'Fisch'")).rows[0].id;
    await tx.query(
      "insert into items (short_code, name, category_id, compartment_id, frozen_at) values ('B1', 'Forelle', $1, $2, '2026-11-01')",
      [cat, c],
    );
  });
  const freezerA = (await db.query<{ id: string }>("select id from freezers where name = 'Keller'")).rows[0].id;
  return { db, a, b, admin, none, A, B, freezerA };
}

describe('0002 row-level security', () => {
  it('members see only their own household and cannot touch another one', async () => {
    const { db, a, b, A, B, freezerA } = await householdsDb();
    expect(await visible(db, a)).toEqual({ households: [A], rows: 1 + 2 + 10 + 3 });
    expect(await visible(db, b)).toEqual({ households: [B], rows: 1 + 1 + 9 + 1 });
    const beforeA = await snapshot(db, A);

    const upd = await asUser(db, b, (tx) => tx.query("update freezers set name = 'Gekapert' where id = $1", [freezerA]));
    expect(upd.affectedRows).toBe(0);
    const del = await asUser(db, b, (tx) => tx.query('delete from freezers where id = $1', [freezerA]));
    expect(del.affectedRows).toBe(0);
    await expect(
      asUser(db, b, (tx) => tx.query("insert into compartments (freezer_id, name) values ($1, 'Fremd')", [freezerA])),
    ).rejects.toThrow();

    expect(await snapshot(db, A)).toEqual(beforeA);
    expect((await db.query('select name from freezers where id = $1', [freezerA])).rows).toEqual([{ name: 'Keller' }]);
  });

  it('members cannot move their rows into another household or insert into one', async () => {
    const { db, a, A, B, freezerA } = await householdsDb();
    const beforeA = await snapshot(db, A);
    const beforeB = await snapshot(db, B);

    const tryUpdate = (sql: string, params: unknown[]) =>
      asUser(db, a, (tx) => tx.query(sql, params)).then(
        (r) => r.affectedRows,
        () => 'error',
      );
    expect(await tryUpdate('update freezers set household_id = $1 where id = $2', [B, freezerA])).not.toBe(1);
    expect(await tryUpdate("update categories set household_id = $1 where name = 'Eis'", [B])).not.toBe(1);
    await expect(
      asUser(db, a, (tx) => tx.query("insert into freezers (name, household_id) values ('Fremd', $1)", [B])),
    ).rejects.toThrow();
    await expect(
      asUser(db, a, (tx) => tx.query("insert into categories (name, max_months, household_id) values ('Fremd', 1, $1)", [B])),
    ).rejects.toThrow();

    expect((await db.query('select household_id from freezers where id = $1', [freezerA])).rows).toEqual([{ household_id: A }]);
    expect(await snapshot(db, A)).toEqual(beforeA);
    expect(await snapshot(db, B)).toEqual(beforeB);
  });

  it('gives a new household exactly the 9 default categories', async () => {
    const { db, B } = await householdsDb();
    const r = await db.query<{ name: string; max_months: number }>(
      'select name, max_months from categories where household_id = $1',
      [B],
    );
    expect(byName(r.rows)).toEqual(byName(DEFAULT_CATEGORIES));
  });

  it('shows an account without household no data', async () => {
    const { db, none } = await householdsDb();
    expect(await visible(db, none)).toEqual({ households: [], rows: 0 });
    expect(await visible(db, null)).toEqual({ households: [], rows: 0 });
  });

  it('keeps the old app working: rows inserted without household_id land in A', async () => {
    const { db, a, A } = await householdsDb();
    const got = await asUser(db, a, async (tx) => {
      const f = (await tx.query<{ id: string }>("insert into freezers (name) values ('Garage') returning id")).rows[0].id;
      const c = (await tx.query<{ id: string }>(
        "insert into compartments (freezer_id, name) values ($1, 'Oben') returning id",
        [f],
      )).rows[0].id;
      const cat = (await tx.query<{ id: string }>("select id from categories where name = 'Obst'")).rows[0].id;
      await tx.query(
        "insert into items (short_code, name, category_id, compartment_id, frozen_at) values ('G1', 'Kirschen', $1, $2, '2026-11-01')",
        [cat, c],
      );
      return { f, c };
    });
    const r = await db.query<{ household_id: string }>(
      `select household_id from freezers where id = $1
       union all select household_id from compartments where id = $2
       union all select household_id from items where short_code = 'G1'`,
      [got.f, got.c],
    );
    expect(r.rows).toEqual([{ household_id: A }, { household_id: A }, { household_id: A }]);
  });

  it('lets members read only their own profile and household; admins read all', async () => {
    const { db, a, admin, A } = await householdsDb();
    const as = (uid: string | null, sql: string) => asUser(db, uid, async (tx) => (await tx.query(sql)).rows);
    expect(await as(a, 'select user_id from profiles')).toEqual([{ user_id: a }]);
    expect(await as(a, 'select id from households')).toEqual([{ id: A }]);
    expect(await as(admin, 'select user_id from profiles')).toHaveLength(4);
    expect(await as(admin, 'select id from households')).toHaveLength(2);
    expect(await as(null, 'select user_id from profiles')).toEqual([]);
    expect(await as(null, 'select id from households')).toEqual([]);
  });
});

describe('0002 admin functions', () => {
  it('lets the admin switch to another household and back without changing his own', async () => {
    const { db, admin, A, B } = await householdsDb();
    const beforeA = await snapshot(db, A);
    expect((await visible(db, admin)).households).toEqual([A]);

    await asUser(db, admin, (tx) => tx.query('select set_active_household($1)', [B]));
    expect((await visible(db, admin)).households).toEqual([B]);
    await asUser(db, admin, async (tx) => {
      const f = (await tx.query<{ id: string }>("insert into freezers (name) values ('Admin-Truhe') returning id")).rows[0].id;
      const c = (await tx.query<{ id: string }>(
        "insert into compartments (freezer_id, name) values ($1, 'Unten') returning id",
        [f],
      )).rows[0].id;
      const cat = (await tx.query<{ id: string }>("select id from categories where name = 'Gemüse'")).rows[0].id;
      await tx.query(
        "insert into items (short_code, name, category_id, compartment_id, frozen_at) values ('X9', 'Erbsen', $1, $2, '2026-11-02')",
        [cat, c],
      );
    });
    const r = await db.query<{ household_id: string }>(
      "select household_id from freezers where name = 'Admin-Truhe' union all select household_id from items where short_code = 'X9'",
    );
    expect(r.rows).toEqual([{ household_id: B }, { household_id: B }]);

    await asUser(db, admin, (tx) => tx.query('select set_active_household(null)'));
    expect((await visible(db, admin)).households).toEqual([A]);
    expect(await snapshot(db, A)).toEqual(beforeA);
    const p = await db.query('select household_id, active_household_id from profiles where user_id = $1', [admin]);
    expect(p.rows).toEqual([{ household_id: A, active_household_id: null }]);
  });

  it('set_member_household moves the account, never the data', async () => {
    const { db, a, admin, A, B } = await householdsDb();
    const beforeA = await snapshot(db, A);
    const beforeB = await snapshot(db, B);
    await asUser(db, admin, (tx) => tx.query('select set_member_household($1, $2)', [a, B]));
    expect((await visible(db, a)).households).toEqual([B]);
    expect(await snapshot(db, A)).toEqual(beforeA);
    expect(await snapshot(db, B)).toEqual(beforeB);

    await asUser(db, admin, (tx) => tx.query('select set_member_household($1, null)', [a]));
    expect(await visible(db, a)).toEqual({ households: [], rows: 0 });
  });

  it('rename_household renames', async () => {
    const { db, admin, B } = await householdsDb();
    await asUser(db, admin, (tx) => tx.query("select rename_household($1, 'Ferienhaus')", [B]));
    expect((await db.query('select name from households where id = $1', [B])).rows).toEqual([{ name: 'Ferienhaus' }]);
  });

  it('refuses admin functions to non-admins and does not let them edit profiles', async () => {
    const { db, a, b, A, B } = await householdsDb();
    const calls: [string, unknown[]][] = [
      ["select create_household('Meins')", []],
      ['select rename_household($1, $2)', [A, 'Meins']],
      ['select delete_household($1)', [B]],
      ['select set_member_household($1, $2)', [a, B]],
      ['select set_active_household($1)', [B]],
    ];
    for (const [sql, params] of calls) {
      await expect(asUser(db, a, (tx) => tx.query(sql, params))).rejects.toThrow('Nur für Admins');
    }
    const tryWrite = (sql: string, params: unknown[] = []) =>
      asUser(db, a, (tx) => tx.query(sql, params)).then(
        (r) => r.affectedRows,
        () => 'error',
      );
    expect(await tryWrite('update profiles set is_admin = true')).not.toBe(1);
    expect(await tryWrite('update profiles set household_id = $1', [B])).not.toBe(1);
    expect(await tryWrite('update profiles set active_household_id = $1', [B])).not.toBe(1);
    expect(await tryWrite('delete from profiles')).not.toBe(1);
    expect(await tryWrite("insert into households (name) values ('Meins')")).not.toBe(1);
    expect(await tryWrite("update households set name = 'Meins'")).not.toBe(1);
    expect(await tryWrite('delete from households where id = $1', [B])).not.toBe(1);

    const p = await db.query('select household_id, active_household_id, is_admin from profiles where user_id = $1', [a]);
    expect(p.rows).toEqual([{ household_id: A, active_household_id: null, is_admin: false }]);
    expect(await count(db, 'households')).toBe(2);
    expect((await db.query('select name from households where id = $1', [A])).rows).toEqual([{ name: 'Unser Haushalt' }]);
    expect(await visible(db, b)).toMatchObject({ households: [B] });
  });

  it('delete_household refuses households with members or freezers and deletes empty ones with their categories', async () => {
    const { db, admin, A } = await householdsDb();
    await expect(asUser(db, admin, (tx) => tx.query('select delete_household($1)', [A]))).rejects.toThrow(
      'Haushalt kann nicht gelöscht werden: noch Mitglieder',
    );
    const C = await asUser(db, admin, async (tx) =>
      (await tx.query<{ id: string }>("select id from create_household('Dritter')")).rows[0].id,
    );
    const f = (await db.query<{ id: string }>("insert into freezers (name, household_id) values ('C-Truhe', $1) returning id", [C]))
      .rows[0].id;
    await expect(asUser(db, admin, (tx) => tx.query('select delete_household($1)', [C]))).rejects.toThrow(
      'Haushalt kann nicht gelöscht werden: noch Gefriergeräte',
    );
    await db.query('delete from freezers where id = $1', [f]);
    expect(await count(db, 'categories')).toBe(10 + 9 + 9);

    await asUser(db, admin, (tx) => tx.query('select delete_household($1)', [C]));
    expect((await db.query('select id from households where id = $1', [C])).rows).toEqual([]);
    expect(await count(db, 'categories')).toBe(10 + 9);
  });

  it('resets the active household when the household the admin has open is deleted', async () => {
    const { db, admin, A } = await householdsDb();
    const C = await asUser(db, admin, async (tx) => {
      const id = (await tx.query<{ id: string }>("select id from create_household('Dritter')")).rows[0].id;
      await tx.query('select set_active_household($1)', [id]);
      return id;
    });
    await asUser(db, admin, (tx) => tx.query('select delete_household($1)', [C]));
    const p = await db.query('select active_household_id from profiles where user_id = $1', [admin]);
    expect(p.rows).toEqual([{ active_household_id: null }]);
    const cur = await asUser(db, admin, async (tx) => (await tx.query<{ h: string }>('select current_household() as h')).rows[0].h);
    expect(cur).toBe(A);
  });

  it('deleting an account keeps the household data', async () => {
    const { db, a, A } = await householdsDb();
    const beforeA = await snapshot(db, A);
    await db.query('delete from auth.users where id = $1', [a]);
    expect((await db.query('select 1 from profiles where user_id = $1', [a])).rows).toEqual([]);
    expect(await snapshot(db, A)).toEqual(beforeA);
  });
});
