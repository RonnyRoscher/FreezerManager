import { render } from '@testing-library/react';
import App from '../App';
import { createMemoryRepository } from '../data/memoryRepository';
import type { Repository } from '../data/repository';
import type { Printer } from '../printer/printerService';
import { fakePrinter } from './fakePrinter';
import { cellar, drawer2, kitchen, meat, top, veg } from './fixtures';

export function seededRepository(overrides: Parameters<typeof createMemoryRepository>[0] = {}) {
  return createMemoryRepository({
    freezers: [cellar, kitchen],
    compartments: [drawer2, top],
    categories: [meat, veg],
    session: { email: 'ich@example.de' },
    ...overrides,
  });
}

export function renderApp(route: string, repo: Repository = seededRepository(), printer: Printer = fakePrinter()) {
  window.location.hash = route;
  return { repo, printer, ...render(<App repo={repo} printer={printer} />) };
}
