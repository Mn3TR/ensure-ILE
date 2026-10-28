// Cross-check patches/ against the root resolutions and the Yarn lockfile.
//
// Yarn applies a `patch:` resolution only when a resolution selector matches a
// descriptor that some package actually requests. A mismatch, or a package that
// nothing depends on, produces no warning: the install succeeds, the lockfile
// carries no `patch:` entry, and the patch is silently inert. This script
// reports that state instead of trusting the presence of the file.
//
// Orphan status: not part of `yarn check` yet. See docs/upstream-sync.md.
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))

const workspace = readJson(join(root, 'package.json'))
const resolutions = workspace.resolutions ?? {}
const lock = readFileSync(join(root, 'yarn.lock'), 'utf8')

/** Patch file path -> resolution selectors that point at it. */
const declared = new Map()
const missingFiles = []
for (const [selector, target] of Object.entries(resolutions)) {
  if (typeof target !== 'string' || !target.startsWith('patch:')) continue
  const marker = target.indexOf('#')
  // `patch:typescript@...` and `patch:fsevents@...` are Yarn builtins, not files.
  if (marker === -1) continue
  const file = target.slice(marker + 1).replace(/^\.\//u, '')
  if (!file.startsWith('patches/')) continue
  const boundary = selector.indexOf('@npm:')
  if (boundary === -1) continue
  const packageName = selector.slice(0, boundary)
  const selectors = declared.get(file) ?? []
  selectors.push({ selector, packageName })
  declared.set(file, selectors)
}

const onDisk = readdirSync(join(root, 'patches'))
  .filter(name => name.endsWith('.patch'))
  .sort()
  .map(name => `patches/${name}`)
const onDiskSet = new Set(onDisk)

for (const file of declared.keys()) if (!onDiskSet.has(file)) missingFiles.push(file)

const rows = []
for (const file of onDisk) {
  const selectors = declared.get(file) ?? []
  const applied = lock.includes(`./${file}`)
  const packageNames = [...new Set(selectors.map(entry => entry.packageName))]
  const installed = packageNames.filter(name => lock.includes(`"${name}@npm:`))

  let status = 'ok'
  let reason = ''
  if (selectors.length === 0) {
    status = 'invalid'
    reason = 'no resolutions entry references this file; it can never be applied'
  } else if (!applied) {
    status = 'invalid'
    reason = installed.length === 0
      ? `no package requests ${packageNames.join(', ')}; the patch has no subject`
      : 'the resolution selector matched no requested descriptor (descriptor mismatch)'
  }
  rows.push({ file, status, reason, selectors: selectors.map(entry => entry.selector), packages: packageNames })
}

const invalid = rows.filter(row => row.status === 'invalid')
const ok = rows.filter(row => row.status === 'ok')
const lines = []
lines.push(`verify-patch-references: ${String(rows.length)} patch files, ${String(ok.length)} effective, ${String(invalid.length)} ineffective`)
for (const row of rows) {
  lines.push(`  ${row.status === 'ok' ? 'ok    ' : 'INERT '} ${row.file}`)
  if (row.reason !== '') lines.push(`         ${row.reason}`)
}
for (const file of missingFiles) lines.push(`  MISSING ${file} is referenced by resolutions but absent from patches/`)
if (invalid.length === 0 && missingFiles.length === 0) {
  lines.push('all patch files are referenced and applied')
  process.stdout.write(`${lines.join('\n')}\n`)
} else {
  process.stderr.write(`${lines.join('\n')}\n`)
  process.exitCode = 1
}