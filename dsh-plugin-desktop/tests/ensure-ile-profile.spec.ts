import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareDesktopProfile } from '../src/profile.ts'

/**
 * The seeded profile template of this fork, composed the way `seedProfile()`
 * plus a Profile install leave it: our `package.json`, our `cordis.patch.yml`,
 * and every dependency resolvable from the profile's `node_modules`.
 *
 * The links point at the repository packages, which is what `file:` in the
 * development template already means; a vendored profile resolves the same way.
 */
const repo = fileURLToPath(new URL('../../', import.meta.url))
const template = join(repo, 'profiles', 'ensure-ile')

const homes: string[] = []
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function seedTemplate(home: string): string {
  const profileDir = join(home, 'profiles', 'desktop')
  mkdirSync(profileDir, { recursive: true })
  const source = JSON.parse(readFileSync(join(template, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ name: 'desktop', private: true, ...source }))
  for (const file of ['cordis.patch.yml', 'pnpm-workspace.yaml']) {
    if (existsSync(join(template, file))) writeFileSync(join(profileDir, file), readFileSync(join(template, file)))
  }
  for (const name of Object.keys(source.dependencies ?? {})) {
    // Our own packages sit at the repository root; vendored third-party source
    // (dsh-claude-style) sits under vendor/, exactly as prepare-profile.mjs packs it.
    const base = name.split('/').pop()!
    const candidates = [join(repo, base), join(repo, 'vendor', base), join(repo, 'node_modules', ...name.split('/'))]
    const target = candidates.find(candidate => existsSync(join(candidate, 'package.json')))!
    const link = join(profileDir, 'node_modules', ...name.split('/'))
    mkdirSync(join(link, '..'), { recursive: true })
    symlinkSync(target, link, 'junction')
  }
  return profileDir
}

function composedIds(patches: readonly { insert?: readonly { id?: string }[] }[]): string[] {
  return patches.flatMap(patch => (patch.insert ?? []).flatMap(row => (row.id === undefined ? [] : [row.id])))
}

describe('the ensure-ILE profile template', () => {
  const home = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-ensure-ile-profile-'))
    homes.push(dir)
    return dir
  }

  /* `assertUniqueEntryIds` refuses the whole profile on a repeated row id, and
     the app then boots into the recovery page before any plugin runs. Our
     schedule row collided with web-app's own `schedule` row once already; the
     bundle ids of every local package must stay clear of upstream's. */
  it('composes without a duplicate loader entry id', () => {
    const dir = home()
    seedTemplate(dir)
    const prepared = prepareDesktopProfile('1', dir, 'win32')
    const ids = composedIds(prepared.patches as { insert?: { id?: string }[] }[])
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([])
  })

  it('keeps our own row ids beside the upstream ones they resemble', () => {
    const dir = home()
    const profileDir = seedTemplate(dir)
    const prepared = prepareDesktopProfile('1', dir, 'win32')
    const ids = composedIds(prepared.patches as { insert?: { id?: string }[] }[])
    for (const id of ['ile-schedule', 'setup-presets', 'coreset-presets', 'problem-bank', 'textbook', 'memory']) {
      expect(ids).toContain(id)
    }
    const manifest = JSON.parse(readFileSync(join(prepared.profile.dir, 'package.json'), 'utf8')) as {
      dsh?: { profile?: { bundles?: string[] } }
    }
    const bundles = manifest.dsh?.profile?.bundles ?? []
    expect(bundles).toEqual(expect.arrayContaining([
      'dsh-plugin-coreset',
      'dsh-plugin-setup',
      'dsh-plugin-bankmanager',
      'dsh-plugin-schedule',
      'dsh-claude-style',
    ]))
    expect(profileDir).toBe(prepared.profile.dir)
  })

  /* `seedBrandAssets()` copies these into the data root on launch. Without them
     `dsh-claude-style` falls back to its own mark, so a shipped profile that
     lost the files would quietly put Claude's star back on a learner's screen. */
  it('ships the brand lockup that the launch seeds into the data root', () => {
    for (const file of ['mark.svg', 'wordmark.svg']) {
      const path = join(template, 'brand', file)
      expect(existsSync(path)).toBe(true)
      expect(readFileSync(path, 'utf8').trimStart().startsWith('<svg')).toBe(true)
    }
  })
})
