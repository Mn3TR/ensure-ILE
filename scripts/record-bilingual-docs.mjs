#!/usr/bin/env node
/**
 * Re-record the Git blob hashes of every bilingual document pair.
 *
 * A bilingual record is bookkeeping, not content: whenever one side of a pair
 * changes, its `.i18n.yaml` has to repeat the new `git hash-object` value or the
 * documentation gate fails. Editing that by hand is exactly the step people
 * forget, so `yarn docs:record` recomputes every record and rewrites only the
 * lines that are stale.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseBilingualRecord } from './bilingual-docs.mjs'

const root = resolve(import.meta.dirname, '..')
const hashDocument = (path) => execFileSync('git', ['hash-object', path], { cwd: root, encoding: 'utf8' }).trim()

const records = execFileSync('git', ['ls-files', '*.i18n.yaml'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((line) => line.length > 0)

let rewritten = 0
for (const recordPath of records) {
  const absoluteRecord = resolve(root, recordPath)
  const original = readFileSync(absoluteRecord, 'utf8')
  const entries = parseBilingualRecord(recordPath, original)
  const directory = dirname(recordPath)
  const hashes = new Map(
    entries.map((entry) => [entry.filename, hashDocument(directory.length > 0 ? directory + '/' + entry.filename : entry.filename)]),
  )
  const next = original.split('\n').map((line) => {
    const match = /^([^:]+):\s*([0-9a-f]{40})$/u.exec(line.trim())
    if (match === null) return line
    const filename = match[1].trim()
    const hash = hashes.get(filename)
    return hash === undefined || hash === match[2] ? line : filename + ': ' + hash
  }).join('\n')
  if (next !== original) {
    writeFileSync(absoluteRecord, next)
    rewritten += 1
    console.log('recorded: ' + recordPath)
  }
}
console.log('bilingual records: ' + String(records.length) + ' checked, ' + String(rewritten) + ' rewritten')
