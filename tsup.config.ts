import { defineConfig } from 'tsup'

const shared = {
  format: ['esm' as const],
  target: 'node20' as const,
  platform: 'node' as const,
  sourcemap: true,
  splitting: false,
  outExtension: () => ({ js: '.js' }),
}

export default defineConfig([
  {
    ...shared,
    entry: { cli: 'src/cli.ts' },
    banner: { js: '#!/usr/bin/env node' },
    clean: true,
  },
  {
    ...shared,
    entry: { index: 'src/index.ts' },
    dts: true,
  },
])
