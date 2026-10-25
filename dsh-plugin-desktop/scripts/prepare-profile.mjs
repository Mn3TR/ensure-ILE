#!/usr/bin/env node
/**
 * Copy ensure-ILE's profile definition beside the desktop package before
 * packaging. electron-builder's `files` can only reach inside this package, so
 * the repository-level template is mirrored here; `profiles/` is generated and
 * gitignored.
 */
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(packageRoot, '..', 'profiles', 'ensure-ile')
const target = join(packageRoot, 'profiles', 'ensure-ile')

if (!existsSync(source)) {
  console.error('prepare-profile: missing ' + source)
  process.exit(1)
}
rmSync(join(packageRoot, 'profiles'), { recursive: true, force: true })
cpSync(source, target, { recursive: true })
console.log('prepare-profile: copied profiles/ensure-ile')
