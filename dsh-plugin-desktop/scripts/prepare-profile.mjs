#!/usr/bin/env node
/**
 * Copy ensure-ILE's profile definition beside the desktop package before
 * packaging. electron-builder's `files` can only reach inside this package, so
 * the repository-level template is mirrored here; `profiles/` is generated and
 * gitignored.
 *
 * The profile's seven local packages cannot be installed from a packaged app:
 * electron-builder never ships sibling workspace directories, so a
 * `file:../../../../dsh-plugin-*` dependency points outside the installation.
 * They are vendored into `profiles/ensure-ile/vendor/` and the packaged copy of
 * `package.json` is rewritten to `file:./vendor/<name>`. The repository template
 * keeps its checkout-relative specs, so development keeps linking the sources.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(packageRoot, '..')
const source = join(repoRoot, 'profiles', 'ensure-ile')
const target = join(packageRoot, 'profiles', 'ensure-ile')

/** Local packages the profile mounts; every one is a `file:` link in the repo. */
const LOCAL_PACKAGES = [
  'dsh-plugin-teaching-commons',
  'dsh-plugin-setup',
  'dsh-plugin-guide',
  'dsh-plugin-work',
  'dsh-plugin-hrl',
  'dsh-plugin-bankmanager',
  'dsh-plugin-memory',
  'dsh-plugin-textbook',
  'dsh-plugin-schedule',
  'dsh-plugin-coreset',
  // Vendored third-party source kept under vendor/, not a workspace of ours.
  'dsh-claude-style',
]

if (!existsSync(source)) {
  console.error('prepare-profile: missing ' + source)
  process.exit(1)
}
rmSync(join(packageRoot, 'profiles'), { recursive: true, force: true })
cpSync(source, target, { recursive: true })
console.log('prepare-profile: copied profiles/ensure-ile')

const vendor = join(target, 'vendor')
for (const name of LOCAL_PACKAGES) {
  // A vendored package lives under vendor/<name>; everything else is a root workspace.
  const from = existsSync(join(repoRoot, name, 'package.json'))
    ? join(repoRoot, name)
    : join(repoRoot, 'vendor', name)
  const manifestPath = join(from, 'package.json')
  if (!existsSync(manifestPath)) {
    console.error('prepare-profile: missing local package ' + from)
    process.exit(1)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const to = join(vendor, name)
  mkdirSync(to, { recursive: true })
  cpSync(manifestPath, join(to, 'package.json'))
  // Ship exactly what the package publishes, never its node_modules.
  const entries = Array.isArray(manifest.files) && manifest.files.length > 0
    ? manifest.files
    : ['lib', 'dist', 'prompts', 'skills', 'client.js']
  for (const entry of entries) {
    const entrySource = join(from, entry)
    if (!existsSync(entrySource)) continue
    cpSync(entrySource, join(to, entry), { recursive: true })
  }
  console.log('prepare-profile: vendored ' + name)
}

const packagedManifestPath = join(target, 'package.json')
const packagedManifest = JSON.parse(readFileSync(packagedManifestPath, 'utf8'))
const dependencies = packagedManifest.dependencies ?? {}
for (const name of LOCAL_PACKAGES) {
  if (dependencies[name] !== undefined) dependencies[name] = 'file:./vendor/' + name
}
writeFileSync(packagedManifestPath, JSON.stringify(packagedManifest, null, 2) + '\n')
console.log('prepare-profile: rewrote local dependencies to ./vendor')
