import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    environment: 'node',
  },
  // Next compiles JSX with the automatic runtime, so the components never import React.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      // Before '@dm/module': aliases prefix-match, and the bare one would otherwise swallow the subpath.
      '@dm/module/load': r('./packages/module/src/load.ts'),
      '@dm/module': r('./packages/module/src/index.ts'),
      '@dm/mods/load': r('./packages/mods/src/load.ts'),
      '@dm/mods/testing': r('./packages/mods/src/testing.ts'),
      '@dm/mods': r('./packages/mods/src/index.ts'),
      '@dm/engine': r('./packages/engine/src/index.ts'),
      '@dm/core': r('./packages/core/src/index.ts'),
      // Before '@dm/library': aliases prefix-match, and the bare one would otherwise swallow the subpath.
      '@dm/library/envelope': r('./packages/library/src/envelope.ts'),
      '@dm/library': r('./packages/library/src/index.ts'),
      '@dm/play': r('./packages/play/src/index.ts'),
      '@': r('./apps/editor'),
    },
  },
});
