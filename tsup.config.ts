import { defineConfig } from 'tsup';

export default defineConfig([
  // CLI executable
  {
    entry: {
      'bin/cli': 'src/cli/index.ts',
    },
    format: ['esm'],
    target: 'node18',
    platform: 'node',
    clean: true,
    shims: true,
    dts: false,
    sourcemap: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  // Main library
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm'],
    target: 'node18',
    platform: 'node',
    dts: true,
    sourcemap: true,
    splitting: false,
  },
]);
