import { filterItems, groupByCategory, sortByAge } from './overview';
import { makeItem, meat, top, veg } from '../test/fixtures';

describe('filterItems', () => {
  const mince = makeItem({ name: 'Hackfleisch', details: 'für Bolognese' });
  const beans = makeItem({ name: 'Bohnen', category: veg, compartment: top, short_code: 'K7F3' });
  const all = [mince, beans];

  test('filters by freezer', () => {
    expect(filterItems(all, { freezerId: top.freezer_id })).toEqual([beans]);
  });

  test('matches name case-insensitively', () => {
    expect(filterItems(all, { query: 'hack' })).toEqual([mince]);
  });

  test('matches details', () => {
    expect(filterItems(all, { query: 'bolognese' })).toEqual([mince]);
  });

  test('matches short code', () => {
    expect(filterItems(all, { query: 'k7f3' })).toEqual([beans]);
  });

  test('returns all items for an empty query', () => {
    expect(filterItems(all, { query: '  ' })).toEqual(all);
  });
});

describe('sortByAge', () => {
  test('sorts oldest first, then by name, without mutating input', () => {
    const b = makeItem({ name: 'B', frozen_at: '2026-03-01' });
    const a = makeItem({ name: 'A', frozen_at: '2026-03-01' });
    const old = makeItem({ name: 'Z', frozen_at: '2025-12-01' });
    const input = [b, a, old];
    expect(sortByAge(input)).toEqual([old, a, b]);
    expect(input).toEqual([b, a, old]);
  });
});

describe('groupByCategory', () => {
  test('groups alphabetically by category, items by age, skipping empty categories', () => {
    const newMeat = makeItem({ category: meat, frozen_at: '2026-09-01' });
    const oldMeat = makeItem({ category: meat, frozen_at: '2026-01-01' });
    const peas = makeItem({ category: veg });
    const groups = groupByCategory([newMeat, peas, oldMeat]);
    expect(groups.map((g) => g.category.name)).toEqual(['Fleisch', 'Gemüse']);
    expect(groups[0].items).toEqual([oldMeat, newMeat]);
    expect(groups[1].items).toEqual([peas]);
  });
});
