import { rowToItemView } from './supabaseRepository';
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
