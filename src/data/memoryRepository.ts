import { normalizeShortCode } from '../domain/shortCode';
import type {
  Category,
  Compartment,
  Freezer,
  HouseholdRef,
  Item,
  ItemView,
  Profile,
  ProfileSummary,
} from '../domain/types';
import { createWithShortCode } from './createWithShortCode';
import { DuplicateShortCodeError, InUseError, type Repository, type Session } from './repository';

export type MemorySeed = {
  freezers?: Freezer[];
  compartments?: Compartment[];
  categories?: Category[];
  items?: Item[];
  session?: Session;
  profile?: Profile;
  households?: HouseholdRef[];
  profiles?: ProfileSummary[];
};

type Bucket = {
  freezers: Freezer[];
  compartments: Compartment[];
  categories: Category[];
  items: Item[];
};

const DEFAULT_CATEGORIES: [string, number][] = [
  ['Fleisch', 6],
  ['Geflügel', 6],
  ['Fisch', 4],
  ['Gemüse', 12],
  ['Obst', 12],
  ['Brot & Backwaren', 3],
  ['Fertiggerichte', 3],
  ['Suppen & Soßen', 4],
  ['Sonstiges', 6],
];

const OWN_HOUSEHOLD: HouseholdRef = {
  id: 'household-own',
  name: 'Unser Haushalt',
};

const bySortOrder = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

/** In-memory repository used by tests and local experiments. */
export function createMemoryRepository(seed: MemorySeed = {}): Repository {
  let profile: Profile = seed.profile ?? {
    userId: 'user-me',
    email: 'ich@example.de',
    isAdmin: true,
    household: OWN_HOUSEHOLD,
    activeHousehold: OWN_HOUSEHOLD,
  };
  // null = the admin works in the own household (mirrors profiles.active_household_id).
  let active: HouseholdRef | null =
    profile.activeHousehold && profile.activeHousehold.id !== profile.household?.id
      ? profile.activeHousehold
      : null;
  const currentProfile = (): Profile => ({ ...profile, activeHousehold: active ?? profile.household });
  let households: HouseholdRef[] = [...(seed.households ?? (profile.household ? [profile.household] : []))];
  let profiles: ProfileSummary[] = [
    ...(seed.profiles ?? [
      {
        userId: profile.userId,
        email: profile.email,
        isAdmin: profile.isAdmin,
        householdId: profile.household?.id ?? null,
      },
    ]),
  ];
  // Data is kept per household; the seed belongs to the own household.
  const buckets = new Map<string, Bucket>();
  const ownKey = profile.household?.id ?? '';
  buckets.set(ownKey, {
    freezers: [...(seed.freezers ?? [])],
    compartments: [...(seed.compartments ?? [])],
    categories: [...(seed.categories ?? [])],
    items: [...(seed.items ?? [])],
  });
  const emptyBucket = (): Bucket => ({
    freezers: [],
    compartments: [],
    categories: [],
    items: [],
  });
  const activeKey = () => (profile.isAdmin ? active?.id : undefined) ?? profile.household?.id ?? '';
  const bucket = (): Bucket => {
    const key = activeKey();
    let b = buckets.get(key);
    if (!b) {
      b = emptyBucket();
      buckets.set(key, b);
    }
    return b;
  };
  const requireAdmin = () => {
    if (!profile.isAdmin) throw new Error('Nur für Admins');
  };
  const cleanName = (name: string) => {
    const n = name.trim();
    if (!n) throw new Error('Name darf nicht leer sein');
    return n;
  };
  let session: Session = seed.session ?? null;
  const itemListeners = new Set<() => void>();
  const authListeners = new Set<(s: Session) => void>();

  const notifyItems = () => itemListeners.forEach((cb) => cb());
  const setSession = (s: Session) => {
    session = s;
    authListeners.forEach((cb) => cb(s));
  };

  function toView(item: Item): ItemView {
    const { categories, compartments, freezers } = bucket();
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
    async updatePassword() {},
    async sendPasswordReset() {},
    onAuthChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },

    async listItems() {
      const b = bucket();
      return b.items.map(toView);
    },
    async getItem(id) {
      const b = bucket();
      const item = b.items.find((i) => i.id === id);
      return item ? toView(item) : null;
    },
    async findItemByShortCode(code) {
      const b = bucket();
      const item = b.items.find((i) => i.short_code === normalizeShortCode(code));
      return item ? toView(item) : null;
    },
    async listItemNames() {
      const b = bucket();
      return [...new Set(b.items.map((i) => i.name))].sort((x, y) => x.localeCompare(y, 'de'));
    },
    async createItem(input) {
      const b = bucket();
      const item = await createWithShortCode(async (short_code) => {
        if (b.items.some((i) => i.short_code === short_code)) throw new DuplicateShortCodeError();
        const created: Item = {
          ...input,
          id: crypto.randomUUID(),
          short_code,
          created_at: new Date().toISOString(),
        };
        b.items = [...b.items, created];
        return created;
      });
      notifyItems();
      return item;
    },
    async updateItem(id, input) {
      const b = bucket();
      const existing = b.items.find((i) => i.id === id);
      if (!existing) throw new Error('Item not found');
      const updated = { ...existing, ...input };
      b.items = upsert(b.items, updated);
      notifyItems();
      return updated;
    },
    async removeItem(id) {
      const b = bucket();
      const existing = b.items.find((i) => i.id === id);
      if (!existing) return null;
      b.items = b.items.filter((i) => i.id !== id);
      notifyItems();
      return existing;
    },
    async restoreItem(item) {
      const b = bucket();
      b.items = upsert(b.items, item);
      notifyItems();
    },
    subscribeItems(onChange) {
      itemListeners.add(onChange);
      return () => itemListeners.delete(onChange);
    },

    async listFreezers() {
      const b = bucket();
      return [...b.freezers].sort(bySortOrder).map((f) => ({
        ...f,
        compartments: b.compartments.filter((c) => c.freezer_id === f.id).sort(bySortOrder),
      }));
    },
    async saveFreezer(draft) {
      const b = bucket();
      const freezer: Freezer = {
        ...draft,
        id: draft.id ?? crypto.randomUUID(),
      };
      b.freezers = upsert(b.freezers, freezer);
      return freezer;
    },
    async deleteFreezer(id) {
      const b = bucket();
      const ids = b.compartments.filter((c) => c.freezer_id === id).map((c) => c.id);
      const count = b.items.filter((i) => ids.includes(i.compartment_id)).length;
      if (count > 0) throw new InUseError(count);
      b.compartments = b.compartments.filter((c) => c.freezer_id !== id);
      b.freezers = b.freezers.filter((f) => f.id !== id);
    },
    async saveCompartment(draft) {
      const b = bucket();
      const compartment: Compartment = {
        ...draft,
        id: draft.id ?? crypto.randomUUID(),
      };
      b.compartments = upsert(b.compartments, compartment);
      return compartment;
    },
    async deleteCompartment(id) {
      const b = bucket();
      const count = b.items.filter((i) => i.compartment_id === id).length;
      if (count > 0) throw new InUseError(count);
      b.compartments = b.compartments.filter((c) => c.id !== id);
    },
    async listCategories() {
      const b = bucket();
      return [...b.categories].sort((x, y) => x.name.localeCompare(y.name, 'de'));
    },
    async saveCategory(draft) {
      const b = bucket();
      const category: Category = {
        ...draft,
        id: draft.id ?? crypto.randomUUID(),
      };
      b.categories = upsert(b.categories, category);
      return category;
    },
    async deleteCategory(id) {
      const b = bucket();
      const count = b.items.filter((i) => i.category_id === id).length;
      if (count > 0) throw new InUseError(count);
      b.categories = b.categories.filter((c) => c.id !== id);
    },

    async getProfile() {
      return currentProfile();
    },
    async listHouseholds() {
      requireAdmin();
      return households.map((h) => ({
        ...h,
        memberCount: profiles.filter((p) => p.householdId === h.id).length,
      }));
    },
    async createHousehold(name) {
      requireAdmin();
      const household = { id: crypto.randomUUID(), name: cleanName(name) };
      households = [...households, household];
      buckets.set(household.id, {
        ...emptyBucket(),
        categories: DEFAULT_CATEGORIES.map(([n, max_months]) => ({
          id: crypto.randomUUID(),
          name: n,
          max_months,
        })),
      });
      return household;
    },
    async renameHousehold(id, name) {
      requireAdmin();
      const n = cleanName(name);
      households = households.map((h) => (h.id === id ? { ...h, name: n } : h));
      if (active?.id === id) active = { ...active, name: n };
      const rename = (h: HouseholdRef | null) => (h && h.id === id ? { ...h, name: n } : h);
      profile = {
        ...profile,
        household: rename(profile.household),
      };
    },
    async deleteHousehold(id) {
      requireAdmin();
      if (profiles.some((p) => p.householdId === id)) {
        throw new Error('Haushalt kann nicht gelöscht werden: noch Mitglieder');
      }
      const b = buckets.get(id);
      if (b && b.freezers.length > 0)
        throw new Error('Haushalt kann nicht gelöscht werden: noch Gefriergeräte');
      if (b && b.items.length > 0) throw new Error('Haushalt kann nicht gelöscht werden: noch Lebensmittel');
      buckets.delete(id);
      households = households.filter((h) => h.id !== id);
      if (active?.id === id) active = null;
    },
    async listProfiles() {
      requireAdmin();
      return profiles;
    },
    async setMemberHousehold(userId, householdId) {
      requireAdmin();
      profiles = profiles.map((p) => (p.userId === userId ? { ...p, householdId } : p));
      if (userId === profile.userId) {
        const household = households.find((h) => h.id === householdId) ?? null;
        profile = { ...profile, household };
      }
      notifyItems();
    },
    async setActiveHousehold(householdId) {
      requireAdmin();
      const target =
        householdId === null ? profile.household : (households.find((h) => h.id === householdId) ?? null);
      active = target && target.id !== profile.household?.id ? target : null;
      notifyItems();
    },
  };
}
