import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { changedArtifacts, snapshotArtifacts } from './lib-artifacts.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ensure-ile-artifacts-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'lib'))
  return root
}

test('detects byte changes even when a tracked file is already modified', t => {
  const root = fixture(t)
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  git('init', '--quiet')
  const file = join(root, 'lib', 'index.js')
  writeFileSync(file, 'baseline\n')
  git('add', '--', 'lib/index.js')
  writeFileSync(file, 'stale\n')
  const status = git('status', '--porcelain')
  const before = snapshotArtifacts(join(root, 'lib'))
  writeFileSync(file, 'rebuilt\n')
  assert.equal(git('status', '--porcelain'), status)
  assert.deepEqual(changedArtifacts(before, snapshotArtifacts(join(root, 'lib'))), ['index.js'])
})

test('accepts matching dirty bytes and notices created, deleted and nested files', t => {
  const directory = join(fixture(t), 'lib')
  writeFileSync(join(directory, 'index.js'), 'matching\n')
  const before = snapshotArtifacts(directory)
  writeFileSync(join(directory, 'index.js'), 'matching\n')
  assert.deepEqual(changedArtifacts(before, snapshotArtifacts(directory)), [])
  rmSync(join(directory, 'index.js'))
  mkdirSync(join(directory, 'types'))
  writeFileSync(join(directory, 'types', 'index.d.ts'), 'export {}\n')
  assert.deepEqual(changedArtifacts(before, snapshotArtifacts(directory)), ['index.js', 'types/index.d.ts'])
})
