import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts', presets: 'src/presets.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  sourcemap: true,
  // The host does not provide zod (the memory fork inlines it for the same
  // reason): bundle it so the profile never has to resolve it at runtime.
  noExternal: ['zod'],
})
