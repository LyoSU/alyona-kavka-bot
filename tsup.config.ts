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
  // Keep node_modules external. Bundling them duplicates grammy + bottleneck
  // module instances inside the CJS output, breaking referential checks in
  // the transformer chain (autoRetry+apiThrottler combined) and causing
  // bot.api.getMe() to hang indefinitely. node_modules are copied verbatim
  // into the runtime image by Dockerfile.
  skipNodeModulesBundle: true,
});
