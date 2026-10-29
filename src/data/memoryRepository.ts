import { normalizeShortCode } from '../domain/shortCode';
import type { Category, Compartment, Freezer, Item, ItemView } from '../domain/types';
import { createWithShortCode } from './createWithShortCode';
import { DuplicateShortCodeError, InUseError, type Repository, type Session } from './repository';

export type MemorySeed = {
  freezers?: Freezer[];
  compartments?: Compartment[];
  categories?: Category[];
  items?: Item[];
  session?: Session;
};

const bySortOrder = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

/** In-memory repository used by tests and local experiments. */
export function createMemoryRepository(seed: MemorySeed = {}): Repository {
  let freezers = [...(seed.freezers ?? [])];
  let compartments = [...(seed.compartments ?? [])];
  let categories = [...(seed.categories ?? [])];
  let items = [...(seed.items ?? [])];
  let session: Session = seed.session ?? null;
  const itemListeners = new Set<() => void>();
  const authListeners = new Set<(s: Session) => void>();

  const notifyItems = () => itemListeners.forEach((cb) => cb());
  const setSession = (s: Session) => {
    session = s;
    authListeners.forEach((cb) => cb(s));
  };

  function toView(item: Item): ItemView {
    const category = categories.find((c) => c.id === item.category_id)!;
    const compartment = compartments.find((c) => c.id === item.compartment_id)!;
    const freezer = freezers.find((f) => f.id === compartment.freezer_id)!;
    return { ...item, category, compartment, freezer };
  }

  function upsert<T extends { id: string }>(list: T[], value: T): T[] {
    return list.some((x) => x.id === value.id)
      ? list.map((x) => (x.id === value.id ? value : x))
      : [...list, value];
  }

  return {
    async getSession() {
      return session;
    },
    async signIn(email, password) {
      if (password === 'falsch') throw new Error('Invalid login credentials');
      setSession({ email });
    },
    async signOut() {
      setSession(null);
    },
    onAuthChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },

    async listItems() {
      return items.map(toView);
    },
    async getItem(id) {
      const item = items.find((i) => i.id === id);
      return item ? toView(item) : null;
    },
    async findItemByShortCode(code) {
      const item = items.find((i) => i.short_code === normalizeShortCode(code));
      return item ? toView(item) : null;
    },
    async listItemNames() {
      return [...new Set(items.map((i) => i.name))].sort((a, b) => a.localeCompare(b, 'de'));
    },
    async createItem(input) {
      const item = await createWithShortCode(async (short_code) => {
        if (items.some((i) => i.short_code === short_code)) throw new DuplicateShortCodeError();
        const created: Item = {
          ...input,
          id: crypto.randomUUID(),
          short_code,
          created_at: new Date().toISOString(),
        };
        items = [...items, created];
        return created;
      });
      notifyItems();
      return item;
    },
    async updateItem(id, input) {
      const existing = items.find((i) => i.id === id);
      if (!existing) throw new Error('Item not found');
      const updated = { ...existing, ...input };
      items = upsert(items, updated);
      notifyItems();
      return updated;
    },
    async removeItem(id) {
      const existing = items.find((i) => i.id === id);
      if (!existing) return null;
      items = items.filter((i) => i.id !== id);
      notifyItems();
      return existing;
    },
    async restoreItem(item) {
      items = upsert(items, item);
      notifyItems();
    },
    subscribeItems(onChange) {
      itemListeners.add(onChange);
      return () => itemListeners.delete(onChange);
    },

    async listFreezers() {
      return [...freezers].sort(bySortOrder).map((f) => ({
        ...f,
        compartments: compartments.filter((c) => c.freezer_id === f.id).sort(bySortOrder),
      }));
    },
    async saveFreezer(draft) {
      const freezer: Freezer = { ...draft, id: draft.id ?? crypto.randomUUID() };
      freezers = upsert(freezers, freezer);
      return freezer;
    },
    async deleteFreezer(id) {
      const ids = compartments.filter((c) => c.freezer_id === id).map((c) => c.id);
      const count = items.filter((i) => ids.includes(i.compartment_id)).length;
      if (count > 0) throw new InUseError(count);
      compartments = compartments.filter((c) => c.freezer_id !== id);
      freezers = freezers.filter((f) => f.id !== id);
    },
    async saveCompartment(draft) {
      const compartment: Compartment = { ...draft, id: draft.id ?? crypto.randomUUID() };
      compartments = upsert(compartments, compartment);
      return compartment;
    },
    async deleteCompartment(id) {
      const count = items.filter((i) => i.compartment_id === id).length;
      if (count > 0) throw new InUseError(count);
      compartments = compartments.filter((c) => c.id !== id);
    },
    async listCategories() {
      return [...categories].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    },
    async saveCategory(draft) {
      const category: Category = { ...draft, id: draft.id ?? crypto.randomUUID() };
      categories = upsert(categories, category);
      return category;
    },
    async deleteCategory(id) {
      const count = items.filter((i) => i.category_id === id).length;
      if (count > 0) throw new InUseError(count);
      categories = categories.filter((c) => c.id !== id);
    },
  };
}
