import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      // Before '@dm/module': aliases prefix-match, and the bare one would
      // otherwise swallow the subpath.
      '@dm/module/load': r('./packages/module/src/load.ts'),
      '@dm/module': r('./packages/module/src/index.ts'),
      '@dm/engine': r('./packages/engine/src/index.ts'),
      '@dm/core': r('./packages/core/src/index.ts'),
      '@dm/cli': r('./packages/cli/src/index.ts'),
      '@dm/play': r('./packages/play/src/index.ts'),
      '@': r('./apps/editor'),
    },
  },
});
