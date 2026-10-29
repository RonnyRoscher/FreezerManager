import type { Category, ItemView } from './types';

export type OverviewFilter = { freezerId?: string; query?: string };

export function filterItems(items: ItemView[], f: OverviewFilter): ItemView[] {
  const query = f.query?.trim().toLowerCase() ?? '';
  return items.filter((item) => {
    if (f.freezerId && item.freezer.id !== f.freezerId) return false;
    if (!query) return true;
    return [item.name, item.details ?? '', item.short_code].some((text) =>
      text.toLowerCase().includes(query),
    );
  });
}

export function sortByAge(items: ItemView[]): ItemView[] {
  return [...items].sort(
    (a, b) => a.frozen_at.localeCompare(b.frozen_at) || a.name.localeCompare(b.name, 'de'),
  );
}

export function groupByCategory(items: ItemView[]): { category: Category; items: ItemView[] }[] {
  const groups = new Map<string, { category: Category; items: ItemView[] }>();
  for (const item of sortByAge(items)) {
    const group = groups.get(item.category.id) ?? { category: item.category, items: [] };
    group.items.push(item);
    groups.set(item.category.id, group);
  }
  return [...groups.values()].sort((a, b) => a.category.name.localeCompare(b.category.name, 'de'));
}
