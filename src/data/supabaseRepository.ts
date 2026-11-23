import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { appBaseUrl } from '../domain/qrUrl';
import { normalizeShortCode } from '../domain/shortCode';
import type { Category, Compartment, Freezer, HouseholdRef, Item, ItemView } from '../domain/types';
import { createWithShortCode } from './createWithShortCode';
import { DuplicateShortCodeError, InUseError, type Repository, type Session } from './repository';

const ITEM_SELECT = '*, category:categories(*), compartment:compartments(*, freezer:freezers(*))';

type ItemRow = Item & {
  category: Category;
  compartment: Compartment & { freezer: Freezer };
};

type ProfileRow = {
  user_id: string;
  email: string;
  household_id: string | null;
  active_household_id: string | null;
  is_admin: boolean;
};

export function rowToItemView(row: ItemRow): ItemView {
  const { freezer, ...compartment } = row.compartment;
  return { ...row, compartment, freezer };
}

/** Unwraps a Supabase response; `null` data is only possible for maybeSingle() calls. */
function check<T>({ data, error }: { data: T | null; error: PostgrestError | null }): T {
  if (error) {
    if (error.code === '23505' && error.message.includes('short_code')) {
      throw new DuplicateShortCodeError();
    }
    throw error;
  }
  return data as T;
}

function toSession(session: { user: { email?: string } } | null): Session {
  return session ? { email: session.user.email ?? '' } : null;
}

export function createSupabaseRepository(client: SupabaseClient): Repository {
  async function countItems(column: 'category_id' | 'compartment_id', ids: string[]) {
    if (ids.length === 0) return 0;
    const { count, error } = await client
      .from('items')
      .select('id', { count: 'exact', head: true })
      .in(column, ids);
    if (error) throw error;
    return count ?? 0;
  }

  async function ensureUnused(column: 'category_id' | 'compartment_id', ids: string[]) {
    const count = await countItems(column, ids);
    if (count > 0) throw new InUseError(count);
  }

  /** Calls a database function; its error messages are user-facing and passed on verbatim. */
  async function rpc<T = null>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  }

  return {
    async getSession() {
      const { data } = await client.auth.getSession();
      return toSession(data.session);
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signOut() {
      await client.auth.signOut();
    },
    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
    },
    async sendPasswordReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: appBaseUrl() });
      if (error) throw error;
    },
    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange((_event, session) => cb(toSession(session)));
      return () => data.subscription.unsubscribe();
    },

    async listItems() {
      const rows = check(await client.from('items').select(ITEM_SELECT));
      return (rows as ItemRow[]).map(rowToItemView);
    },
    async getItem(id) {
      const row = check(await client.from('items').select(ITEM_SELECT).eq('id', id).maybeSingle());
      return row ? rowToItemView(row as ItemRow) : null;
    },
    async findItemByShortCode(code) {
      const row = check(
        await client
          .from('items')
          .select(ITEM_SELECT)
          .eq('short_code', normalizeShortCode(code))
          .maybeSingle(),
      );
      return row ? rowToItemView(row as ItemRow) : null;
    },
    async listItemNames() {
      const rows = check(await client.from('items').select('name')) as { name: string }[];
      return [...new Set(rows.map((r) => r.name))].sort((a, b) => a.localeCompare(b, 'de'));
    },
    async createItem(input) {
      return createWithShortCode(async (short_code) =>
        check(await client.from('items').insert({ ...input, short_code }).select().single()),
      );
    },
    async updateItem(id, input) {
      return check(await client.from('items').update(input).eq('id', id).select().single());
    },
    async removeItem(id) {
      const row = check(await client.from('items').delete().eq('id', id).select().maybeSingle());
      return (row as Item | null) ?? null;
    },
    async restoreItem(item) {
      check(await client.from('items').insert(item));
    },
    subscribeItems(onChange) {
      // Unique topic: a channel with the same name may still be leaving after a quick remount.
      const channel = client
        .channel(`items-changes-${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => onChange())
        // Reload after every (re)join, since events during a disconnect are lost.
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') onChange();
        });
      return () => {
        client.removeChannel(channel);
      };
    },

    async listFreezers() {
      const rows = check(
        await client.from('freezers').select('*, compartments(*)').order('sort_order'),
      ) as (Freezer & { compartments: Compartment[] })[];
      return rows.map((f) => ({
        ...f,
        compartments: [...f.compartments].sort((a, b) => a.sort_order - b.sort_order),
      }));
    },
    async saveFreezer(draft) {
      return check(await client.from('freezers').upsert(draft).select().single());
    },
    async deleteFreezer(id) {
      const compartments = check(
        await client.from('compartments').select('id').eq('freezer_id', id),
      ) as { id: string }[];
      await ensureUnused('compartment_id', compartments.map((c) => c.id));
      check(await client.from('freezers').delete().eq('id', id));
    },
    async saveCompartment(draft) {
      return check(await client.from('compartments').upsert(draft).select().single());
    },
    async deleteCompartment(id) {
      await ensureUnused('compartment_id', [id]);
      check(await client.from('compartments').delete().eq('id', id));
    },
    async listCategories() {
      return check(await client.from('categories').select('*').order('name'));
    },
    async saveCategory(draft) {
      return check(await client.from('categories').upsert(draft).select().single());
    },
    async deleteCategory(id) {
      await ensureUnused('category_id', [id]);
      check(await client.from('categories').delete().eq('id', id));
    },
    async getProfile() {
      const { data: userData } = await client.auth.getUser();
      const user = userData.user;
      if (!user) return null;
      const row = check(
        await client
          .from('profiles')
          .select('user_id, email, household_id, active_household_id, is_admin')
          .eq('user_id', user.id)
          .maybeSingle(),
      ) as ProfileRow | null;
      if (!row) return null;
      // Mirrors public.current_household(): only admins can act in another household.
      const activeId = row.is_admin && row.active_household_id ? row.active_household_id : row.household_id;
      const ids = [...new Set([row.household_id, activeId].filter((id): id is string => !!id))];
      const rows = ids.length
        ? (check(await client.from('households').select('id, name').in('id', ids)) as HouseholdRef[])
        : [];
      const find = (id: string | null) => rows.find((h) => h.id === id) ?? null;
      return {
        userId: row.user_id,
        email: row.email,
        isAdmin: row.is_admin,
        household: find(row.household_id),
        activeHousehold: find(activeId),
      };
    },
    async listHouseholds() {
      const households = check(
        await client.from('households').select('id, name').order('name'),
      ) as HouseholdRef[];
      const members = check(await client.from('profiles').select('household_id')) as {
        household_id: string | null;
      }[];
      return households.map((h) => ({
        ...h,
        memberCount: members.filter((m) => m.household_id === h.id).length,
      }));
    },
    async createHousehold(name) {
      return rpc<HouseholdRef>('create_household', { name });
    },
    async renameHousehold(id, name) {
      await rpc('rename_household', { id, name });
    },
    async deleteHousehold(id) {
      await rpc('delete_household', { id });
    },
    async listProfiles() {
      const rows = check(
        await client.from('profiles').select('user_id, email, household_id, is_admin').order('email'),
      ) as ProfileRow[];
      return rows.map((r) => ({
        userId: r.user_id,
        email: r.email,
        isAdmin: r.is_admin,
        householdId: r.household_id,
      }));
    },
    async setMemberHousehold(userId, householdId) {
      await rpc('set_member_household', { user_id: userId, household_id: householdId });
    },
    async setActiveHousehold(householdId) {
      await rpc('set_active_household', { household_id: householdId });
    },
  };
}
