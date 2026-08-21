import type { NextConfig } from 'next';

const config: NextConfig = {
  // A directory of files, servable by anything.
  output: 'export',

  // The workspace packages ship as TypeScript source, so Next compiles them.
  transpilePackages: ['@dm/play', '@dm/module', '@dm/core', '@dm/engine', '@dm/mods', '@dm/library'],

  typescript: { ignoreBuildErrors: false },

  webpack: (webpackConfig) => {
    // Those packages use ESM `.js` relative imports, mapped back to `.ts` source here.
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
