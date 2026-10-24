/**
 * Bundle the host half with zod inlined.
 *
 * The profile installs this package from a local directory with no registry
 * access, so a runtime dependency would break the offline install. zod is the
 * only one; every @deepseek-ai/* specifier stays external because the Host
 * provides those services and a second copy would break class identity.
 */
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['@deepseek-ai/*', 'node:*'],
  outfile: 'dist/index.js',
  allowOverwrite: true,
  logLevel: 'info',
})
