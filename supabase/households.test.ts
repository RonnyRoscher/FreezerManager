// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createDb, addUser, asUser } from '../src/test/supabaseDb';

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
