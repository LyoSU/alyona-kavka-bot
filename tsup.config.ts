import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['cjs'],
  target: 'node24',
  outDir: 'dist',
  outExtension: () => ({ js: '.cjs' }),
  clean: true,
  sourcemap: true,
  minify: false,
  splitting: false,
  bundle: true,
  skipNodeModulesBundle: false,
  noExternal: [/.*/],
});
