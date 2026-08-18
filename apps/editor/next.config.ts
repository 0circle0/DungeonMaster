import type { NextConfig } from 'next';

const config: NextConfig = {
  // A directory of files, servable by anything.
  //
  // This is the enforcement, not a deployment preference: `output: 'export'`
  // fails the build on a route handler, a `cookies()` read, or any other
  // dynamic server API — so the studio cannot quietly regain the ability to
  // write to the machine serving it.
  output: 'export',

  // The workspace packages ship as TypeScript source, so Next compiles them
  // rather than expecting a build step. This is what lets the editor share the
  // exact schemas the engine validates against — one source of truth.
  transpilePackages: ['@dm/module', '@dm/core', '@dm/engine', '@dm/mods', '@dm/library'],

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
