import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRepository, rowToItemView } from './supabaseRepository';
import { cellar, drawer2, meat } from '../test/fixtures';

test('rowToItemView lifts the nested freezer out of the compartment', () => {
  const row = {
    id: 'i1',
    short_code: 'K7F3',
    name: 'Hackfleisch',
    details: null,
    quantity: '500 g',
    category_id: meat.id,
    compartment_id: drawer2.id,
    frozen_at: '2026-10-18',
    created_at: '2026-10-18T10:00:00Z',
    category: meat,
    compartment: { ...drawer2, freezer: cellar },
  };
  const view = rowToItemView(row);
  expect(view.freezer).toEqual(cellar);
  expect(view.compartment).toEqual(drawer2);
  expect(view.category).toEqual(meat);
  expect(view.short_code).toBe('K7F3');
});

describe('subscribeItems', () => {
  function fakeClient() {
    const topics: string[] = [];
    const statusCallbacks: ((status: string) => void)[] = [];
    const channel = {
      on: () => channel,
      subscribe: (cb: (status: string) => void) => {
        statusCallbacks.push(cb);
        return channel;
      },
    };
    const client = {
      channel: (topic: string) => {
        topics.push(topic);
        return channel;
      },
      removeChannel: vi.fn(),
    };
    return { client: client as unknown as SupabaseClient, topics, statusCallbacks };
  }

  test('uses a fresh channel per subscription', () => {
    const { client, topics } = fakeClient();
    const repo = createSupabaseRepository(client);
    repo.subscribeItems(() => undefined)();
    repo.subscribeItems(() => undefined);
    expect(new Set(topics).size).toBe(2);
  });

  test('notifies on (re)subscription so missed events are reloaded', () => {
    const { client, statusCallbacks } = fakeClient();
    const onChange = vi.fn();
    createSupabaseRepository(client).subscribeItems(onChange);
    statusCallbacks[0]('SUBSCRIBED');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('households', () => {
  type Result = { data: unknown; error: { message: string } | null };

  function fakeClient(
    opts: { rpcResult?: Result; tables?: Record<string, unknown>; user?: unknown; authError?: { message: string } } = {},
  ) {
    const rpcCalls: [string, unknown][] = [];
    const tables = opts.tables ?? {};
    const client = {
      rpc: (fn: string, args: unknown) => {
        rpcCalls.push([fn, args]);
        return Promise.resolve(opts.rpcResult ?? { data: null, error: null });
      },
      auth: {
        getUser: () => Promise.resolve({ data: { user: opts.user ?? null }, error: opts.authError ?? null }),
      },
      from: (table: string) => {
        const result = { data: tables[table] ?? null, error: null };
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          in: () => builder,
          order: () => builder,
          maybeSingle: () => Promise.resolve(result),
          then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
        };
        return builder;
      },
    };
    return { client: client as unknown as SupabaseClient, rpcCalls };
  }

  test('createHousehold calls the RPC with the SQL parameter name', async () => {
    const { client, rpcCalls } = fakeClient({ rpcResult: { data: { id: 'h1', name: 'Müller' }, error: null } });
    const h = await createSupabaseRepository(client).createHousehold('Müller');
    expect(rpcCalls).toEqual([['create_household', { name: 'Müller' }]]);
    expect(h).toEqual({ id: 'h1', name: 'Müller' });
  });

  test('setActiveHousehold(null) passes null', async () => {
    const { client, rpcCalls } = fakeClient();
    await createSupabaseRepository(client).setActiveHousehold(null);
    expect(rpcCalls).toEqual([['set_active_household', { household_id: null }]]);
  });

  test('setMemberHousehold, renameHousehold, deleteHousehold use SQL parameter names', async () => {
    const { client, rpcCalls } = fakeClient();
    const repo = createSupabaseRepository(client);
    await repo.setMemberHousehold('u1', 'h1');
    await repo.renameHousehold('h1', 'Neu');
    await repo.deleteHousehold('h1');
    expect(rpcCalls).toEqual([
      ['set_member_household', { user_id: 'u1', household_id: 'h1' }],
      ['rename_household', { id: 'h1', name: 'Neu' }],
      ['delete_household', { id: 'h1' }],
    ]);
  });

  test('database errors reach the caller verbatim', async () => {
    const message = 'Haushalt kann nicht gelöscht werden: noch Mitglieder';
    const { client } = fakeClient({ rpcResult: { data: null, error: { message } } });
    await expect(createSupabaseRepository(client).deleteHousehold('h1')).rejects.toThrow(
      new Error(message),
    );
  });

  const households = [
    { id: 'h1', name: 'Müller' },
    { id: 'h2', name: 'Schmidt' },
  ];

  test('getProfile: member sees own household as active', async () => {
    const { client } = fakeClient({
      user: { id: 'u1' },
      tables: {
        profiles: { user_id: 'u1', email: 'a@x.de', household_id: 'h1', active_household_id: 'h2', is_admin: false },
        households,
      },
    });
    expect(await createSupabaseRepository(client).getProfile()).toEqual({
      userId: 'u1',
      email: 'a@x.de',
      isAdmin: false,
      household: households[0],
      activeHousehold: households[0],
    });
  });

  test('getProfile: admin with active household uses it', async () => {
    const { client } = fakeClient({
      user: { id: 'u1' },
      tables: {
        profiles: { user_id: 'u1', email: 'a@x.de', household_id: 'h1', active_household_id: 'h2', is_admin: true },
        households,
      },
    });
    const p = await createSupabaseRepository(client).getProfile();
    expect(p?.household).toEqual(households[0]);
    expect(p?.activeHousehold).toEqual(households[1]);
  });

  test('getProfile: getUser returns an error -> rejects instead of null', async () => {
    const { client } = fakeClient({ authError: { message: 'network' } });
    await expect(createSupabaseRepository(client).getProfile()).rejects.toThrow();
  });

  test('getProfile: null when not signed in', async () => {
    const { client } = fakeClient();
    expect(await createSupabaseRepository(client).getProfile()).toBeNull();
  });
});
