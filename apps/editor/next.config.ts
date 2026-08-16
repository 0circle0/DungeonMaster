import type { NextConfig } from 'next';

const config: NextConfig = {
  // The workspace packages ship as TypeScript source, so Next compiles them
  // rather than expecting a build step. This is what lets the editor share the
  // exact schemas the engine validates against — one source of truth.
  transpilePackages: ['@dm/module', '@dm/core', '@dm/engine', '@dm/mods'],

  typescript: { ignoreBuildErrors: false },

  webpack: (webpackConfig) => {
    // Those packages use ESM-style relative imports ending in `.js`, which is
    // correct for Node but needs mapping back to the `.ts` source here.
    webpackConfig.resolve.extensionAlias = {
      ...webpackConfig.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return webpackConfig;
  },

  turbopack: {
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },
};

export default config;
