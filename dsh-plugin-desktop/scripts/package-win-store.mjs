/**
 * Dev-loop packaging: same pipeline as `dist:win`, but the payload archive is
 * stored instead of LZMA2-compressed. Measured 2026-11-01 on this repo:
 * 215 s / 655 MiB against 550 s / 164 MiB for `normal`. Never ship this one —
 * `DSH_WINDOWS_PACKAGE_COMPRESSION` exists for smoke and local iteration
 * (scripts/package-win.ts:30-41), while release artifacts keep
 * `build.win.compression: "normal"`.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const result = spawnSync(process.execPath, [join(here, 'package-win.ts')], {
  cwd: resolve(here, '..'),
  stdio: 'inherit',
  env: { ...process.env, DSH_WINDOWS_PACKAGE_COMPRESSION: 'store' },
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
