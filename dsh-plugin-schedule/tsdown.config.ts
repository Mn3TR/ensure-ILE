import { defineConfig } from 'tsdown'

export default defineConfig({
  // 只有插件行一个入口：store / plan 是纯逻辑，被 index 打包进去，不单独对外导出。
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  sourcemap: true,
})
