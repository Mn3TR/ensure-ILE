/**
 * Bundle the host half with third-party runtime dependencies inlined.
 *
 * The profile installs this package from a local directory without registry
 * access. zod and the optional cloud-sync implementation travel in this bundle;
 * every @deepseek-ai/* specifier stays external because the Host provides those
 * services and a second copy would break class identity.
 */
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  banner: { js: "import { createRequire as createBundleRequire } from 'node:module'; const require = createBundleRequire(import.meta.url);" },
  external: ['@deepseek-ai/*', 'node:*'],
  outfile: 'dist/index.js',
  allowOverwrite: true,
  logLevel: 'info',
})
