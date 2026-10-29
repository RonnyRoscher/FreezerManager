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
