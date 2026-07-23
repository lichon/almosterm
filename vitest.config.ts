import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use jsdom for browser-like environment (IndexedDB support)
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
