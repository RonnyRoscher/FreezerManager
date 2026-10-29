export type Freezer = { id: string; name: string; sort_order: number };

export type Compartment = { id: string; freezer_id: string; name: string; sort_order: number };

export type FreezerWithCompartments = Freezer & { compartments: Compartment[] };

export type Category = { id: string; name: string; max_months: number };

export type Item = {
  id: string;
  short_code: string;
  name: string;
  details: string | null;
  quantity: string | null;
  category_id: string;
  compartment_id: string;
  frozen_at: string;
  created_at: string;
};

export type ItemInput = Omit<Item, 'id' | 'short_code' | 'created_at'>;

export type ItemView = Item & { category: Category; compartment: Compartment; freezer: Freezer };

export type ExpiryStatus = 'ok' | 'soon' | 'overdue';
