import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  // Not available in the node environment used by the SQL tests.
  if (typeof window !== 'undefined') {
    localStorage.clear();
    window.location.hash = '';
  }
});
