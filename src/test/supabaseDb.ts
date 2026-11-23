import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_DIR = join(process.cwd(), 'supabase');
const MIGRATIONS_DIR = join(SUPABASE_DIR, 'migrations');

export type MigrationName = '0001' | '0002';

function migrationFile(name: MigrationName): string | undefined {
  return readdirSync(MIGRATIONS_DIR).find((f) => f.startsWith(`${name}_`) && f.endsWith('.sql'));
}

export async function applyMigration(db: PGlite, name: MigrationName): Promise<void> {
  const file = migrationFile(name);
  if (!file) throw new Error(`Migration ${name} not found`);
  await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
}

/** Fresh in-memory DB with the auth stub; default applies all migrations that exist. */
export async function createDb(options: { migrations?: MigrationName[] } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(join(SUPABASE_DIR, 'test', 'auth-stub.sql'), 'utf8'));
  const names = options.migrations ?? (['0001', '0002'] as MigrationName[]).filter((n) => migrationFile(n));
  for (const name of names) await applyMigration(db, name);
  return db;
}

export async function addUser(db: PGlite, email: string): Promise<string> {
  const r = await db.query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email]);
  return r.rows[0].id;
}

/** Runs fn in a transaction as the given user (or anon when null); rolled back on error, committed otherwise. */
export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    if (userId === null) {
      await tx.exec('set local role anon');
    } else {
      await tx.exec('set local role authenticated');
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId })]);
    }
    return fn(tx);
  });
}
