import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', crypto: 'src/compat.ts', rest: 'src/rest/index.ts', rpc: 'src/rpc/index.ts', vault: 'src/vault/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
  platform: 'neutral',
  treeshake: true,
  splitting: true,
  external: ['ws'],
});
