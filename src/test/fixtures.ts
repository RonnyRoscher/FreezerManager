import type { Category, Compartment, Freezer, ItemView } from '../domain/types';

export const meat: Category = { id: 'cat-meat', name: 'Fleisch', max_months: 6 };
export const veg: Category = { id: 'cat-veg', name: 'Gemüse', max_months: 12 };
export const cellar: Freezer = { id: 'fr-cellar', name: 'Keller-Truhe', sort_order: 0 };
export const kitchen: Freezer = { id: 'fr-kitchen', name: 'Küche', sort_order: 1 };
export const drawer2: Compartment = { id: 'co-d2', freezer_id: cellar.id, name: 'Schublade 2', sort_order: 1 };
export const top: Compartment = { id: 'co-top', freezer_id: kitchen.id, name: 'Fach oben', sort_order: 0 };

let counter = 0;

export function makeItem(partial: Partial<ItemView> = {}): ItemView {
  counter += 1;
  const category = partial.category ?? meat;
  const compartment = partial.compartment ?? drawer2;
  const freezer = partial.freezer ?? (compartment.freezer_id === kitchen.id ? kitchen : cellar);
  return {
    id: `item-${counter}`,
    short_code: `C${String(counter).padStart(3, '0')}`,
    name: 'Hackfleisch',
    details: null,
    quantity: null,
    frozen_at: '2026-06-18',
    created_at: '2026-06-18T10:00:00Z',
    ...partial,
    category,
    compartment,
    freezer,
    category_id: category.id,
    compartment_id: compartment.id,
  };
}
