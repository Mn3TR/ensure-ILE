import { defineConfig } from 'tsdown'

export default defineConfig({
  // store 单独出一份：schedule 等兄弟插件按 `dsh-plugin-bankmanager/store` 只读题库数据
  entry: { index: 'src/index.ts', store: 'src/store.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  sourcemap: true,
})
