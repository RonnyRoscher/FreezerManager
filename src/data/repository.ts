import type {
  Category,
  Compartment,
  Freezer,
  FreezerWithCompartments,
  Item,
  ItemInput,
  ItemView,
} from '../domain/types';

/** Thrown when deleting a freezer, compartment or category that still has items. */
export class InUseError extends Error {
  constructor(public count: number) {
    super(`In use by ${count} items`);
    this.name = 'InUseError';
  }
}

export class DuplicateShortCodeError extends Error {
  constructor() {
    super('Duplicate short code');
    this.name = 'DuplicateShortCodeError';
  }
}

export type Session = { email: string } | null;

export type FreezerDraft = { id?: string; name: string; sort_order: number };
export type CompartmentDraft = { id?: string; freezer_id: string; name: string; sort_order: number };
export type CategoryDraft = { id?: string; name: string; max_months: number };

export interface Repository {
  getSession(): Promise<Session>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthChange(cb: (s: Session) => void): () => void;

  listItems(): Promise<ItemView[]>;
  getItem(id: string): Promise<ItemView | null>;
  findItemByShortCode(code: string): Promise<ItemView | null>;
  listItemNames(): Promise<string[]>;
  createItem(input: ItemInput): Promise<Item>;
  updateItem(id: string, input: ItemInput): Promise<Item>;
  /** Returns the deleted item, or null if it no longer exists. */
  removeItem(id: string): Promise<Item | null>;
  /** Re-inserts a removed item with the same id and short code. */
  restoreItem(item: Item): Promise<void>;
  subscribeItems(onChange: () => void): () => void;

  listFreezers(): Promise<FreezerWithCompartments[]>;
  saveFreezer(f: FreezerDraft): Promise<Freezer>;
  deleteFreezer(id: string): Promise<void>;
  saveCompartment(c: CompartmentDraft): Promise<Compartment>;
  deleteCompartment(id: string): Promise<void>;
  listCategories(): Promise<Category[]>;
  saveCategory(c: CategoryDraft): Promise<Category>;
  deleteCategory(id: string): Promise<void>;
}
