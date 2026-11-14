import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'

/** Snapshot actual bytes and names, including already-dirty and new build files. */
export function snapshotArtifacts(directory) {
  const snapshot = new Map()
  function walk(relative) {
    const absolute = join(directory, relative)
    if (!existsSync(absolute)) return
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const key = relative ? relative + '/' + entry.name : entry.name
      const file = join(directory, key)
      if (entry.isDirectory()) walk(key)
      else if (entry.isSymbolicLink()) snapshot.set(key, 'link:' + readlinkSync(file))
      else if (entry.isFile()) snapshot.set(key, createHash('sha256').update(readFileSync(file)).digest('hex'))
    }
  }
  walk('')
  return snapshot
}

export function changedArtifacts(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter(key => before.get(key) !== after.get(key)).sort()
}
