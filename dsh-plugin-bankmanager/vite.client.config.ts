import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const { name } = JSON.parse(readFileSync('package.json', 'utf8'))

/**
 * 浏览器半边：CJS 包一层 `__ModuleLoader__.load`，与上游客户端插件的装载协议一致。
 * React 与所有 @deepseek-ai/* 都交给宿主模块表，包里只留我们自己的代码。
 */
export default defineConfig({
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'lib', emptyOutDir: false, target: 'es2022', minify: false,
    lib: { entry: 'src/client/index.ts', formats: ['cjs'], fileName: () => 'client.js' },
    rollupOptions: {
      external: id => /^(react(?:-dom)?(?:\/|$)|@deepseek-ai\/)/u.test(id),
      output: {
        codeSplitting: false,
        banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(name)}, factory: (require) => {`,
        intro: 'var module = { exports: {} }; var exports = module.exports;',
        footer: 'return module.exports; } });',
      },
    },
  },
})
