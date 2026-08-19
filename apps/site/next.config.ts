import type { NextConfig } from 'next';

const config: NextConfig = {
  // A directory of files, servable by anything. The site reads the schemas at
  // build time and ships finished HTML, so there is nothing for a server to do.
  output: 'export',

  // The workspace packages ship as TypeScript source, so Next compiles them
  // rather than expecting a build step. This is what lets the reference tables
  // come from the same schemas the validator enforces.
  transpilePackages: ['@dm/module', '@dm/core'],

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
