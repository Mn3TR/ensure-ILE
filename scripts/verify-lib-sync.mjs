#!/usr/bin/env node
/**
 * Verify that every committed `lib/` artifact still matches its `src/`.
 *
 * Eleven plugin packages commit their build output because the profile links the
 * packages by path and the Host loads `lib/index.js` directly (only
 * dsh-plugin-memory and the Desktop shell build on demand). That makes a stale
 * `lib/` invisible: the tests of every consumer keep passing against the old
 * code. This gate rebuilds each package and compares every artifact's path and
 * SHA-256, including client bundles and files that were already dirty.
 *
 * Deliberately skipped:
 * - dsh-plugin-skin: its lib/client.js is a hand-edited vendored artifact, not
 *   reproducible from src (see its UPSTREAM.md).
 * - packages without a tracked lib/ (dsh-plugin-memory, dsh-plugin-desktop).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { changedArtifacts, snapshotArtifacts } from './lib-artifacts.mjs'

const root = resolve(import.meta.dirname, '..')
const SKIP = new Set(['dsh-plugin-skin'])

const workspaces = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).workspaces
const packages = workspaces
  .filter((name) => !SKIP.has(name))
  .filter((name) => existsSync(join(root, name, 'package.json')))
  .filter((name) => {
    const scripts = JSON.parse(readFileSync(join(root, name, 'package.json'), 'utf8')).scripts ?? {}
    const tracked = spawnSync('git', ['ls-files', '--', `${name}/lib/*`], { cwd: root, encoding: 'utf8' })
    return typeof scripts.build === 'string' && (tracked.stdout ?? '').trim() !== ''
  })

// `yarn` is a Corepack shim here, not a PATH entry of its own; run it through
// Corepack so the gate behaves the same locally and on CI.
const YARN = `corepack yarn`
// Compare file names and bytes, not porcelain status: an already-dirty file
// can change from one stale version to another while its status stays M.
const dirty = []
for (const name of packages) {
  const directory = join(root, name, 'lib')
  const before = snapshotArtifacts(directory)
  const scripts = JSON.parse(readFileSync(join(root, name, 'package.json'), 'utf8')).scripts ?? {}
  for (const script of ['build', 'build:client'].filter(script => typeof scripts[script] === 'string')) {
    const build = spawnSync(`${YARN} workspace ${name} ${script}`, { cwd: root, stdio: 'inherit', shell: true })
    if (build.status !== 0) {
      console.error(`verify-lib-sync: ${name}: ${script} failed (exit ${build.status})`)
      process.exit(1)
    }
  }
  const changes = changedArtifacts(before, snapshotArtifacts(directory))
  if (changes.length > 0) dirty.push({ name, changes })
}

if (dirty.length > 0) {
  console.error('verify-lib-sync: committed lib/ does not match src/ for these packages:')
  for (const { name, changes } of dirty) {
    console.error(`  ${name}`)
    for (const line of changes) console.error(`    ${line}`)
  }
  console.error('Rebuild and commit those files (the profile loads lib/, not src/).')
  process.exit(1)
}

console.log(`verify-lib-sync: ${packages.length} packages rebuild byte-identical: ${packages.join(', ')}`)
