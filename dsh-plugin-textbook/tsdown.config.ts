import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts', data: 'src/data.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  sourcemap: true,
})
