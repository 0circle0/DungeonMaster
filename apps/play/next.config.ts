import type { NextConfig } from 'next';

const config: NextConfig = {
  // A directory of files, servable by anything.
  //
  // This is the enforcement, not a deployment preference: `output: 'export'`
  // fails the build on a route handler, a `cookies()` read, or any other
  // dynamic server API. "Nothing saves from the client to a server" stops being
  // a rule somebody has to remember and becomes a compile error.
  output: 'export',

  // The workspace packages ship as TypeScript source, so Next compiles them
  // rather than expecting a build step. `@dm/play` here is also the proof that
  // no Node API leaked into the play layer: this build resolves the real
  // import graph, and a stray `node:fs` fails it.
  transpilePackages: ['@dm/play', '@dm/module', '@dm/core', '@dm/engine', '@dm/mods', '@dm/library'],

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
