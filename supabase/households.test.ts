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
