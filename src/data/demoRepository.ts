import { addMonths, todayIso } from '../domain/dates';
import { createMemoryRepository } from './memoryRepository';

/** In-memory data for trying the app without a Supabase project (lost on reload). */
export function createDemoRepository() {
  const today = todayIso();
  const freezers = [
    { id: 'demo-f1', name: 'Keller-Truhe', sort_order: 0 },
    { id: 'demo-f2', name: 'Küche', sort_order: 1 },
  ];
  const compartments = [
    { id: 'demo-c1', freezer_id: 'demo-f1', name: 'Schublade 1', sort_order: 0 },
    { id: 'demo-c2', freezer_id: 'demo-f1', name: 'Schublade 2', sort_order: 1 },
    { id: 'demo-c3', freezer_id: 'demo-f2', name: 'Fach oben', sort_order: 0 },
  ];
  const categories = [
    { id: 'demo-k1', name: 'Fleisch', max_months: 6 },
    { id: 'demo-k2', name: 'Gemüse', max_months: 12 },
    { id: 'demo-k3', name: 'Brot & Backwaren', max_months: 3 },
  ];
  const item = (n: number, name: string, category_id: string, compartment_id: string, monthsAgo: number, quantity: string | null) => ({
    id: `00000000-0000-4000-8000-00000000000${n}`,
    short_code: ['K7F3', 'M2QX', 'B9TR', 'H4WZ'][n - 1],
    name,
    details: null,
    quantity,
    category_id,
    compartment_id,
    frozen_at: addMonths(today, -monthsAgo),
    created_at: new Date().toISOString(),
  });
  return createMemoryRepository({
    freezers,
    compartments,
    categories,
    items: [
      item(1, 'Hackfleisch', 'demo-k1', 'demo-c2', 4, '500 g'),
      item(2, 'Gulasch', 'demo-k1', 'demo-c1', 7, '2 Portionen'),
      item(3, 'Erbsen', 'demo-k2', 'demo-c3', 1, '750 g'),
      item(4, 'Brötchen', 'demo-k3', 'demo-c3', 2, '6 Stück'),
    ],
    session: { email: 'demo@example.de' },
  });
}
