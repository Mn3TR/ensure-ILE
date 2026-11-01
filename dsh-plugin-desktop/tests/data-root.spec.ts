import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LEGACY_DATA_ROOT_NAME,
  MIGRATED_DATA_ROOT_SUFFIX,
  PACKAGED_DATA_ROOT_NAME,
  legacyDataRoot,
  migrateLegacyDataRoot,
  packagedDataRoot,
  resolveDataRoot,
} from '../src/data-root.ts'

const roots: string[] = []

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop()
    if (root !== undefined) rmSync(root, { recursive: true, force: true })
  }
})

/** A scratch directory that the test may write into. */
function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), 'ensure-ile-data-root-'))
  roots.push(root)
  return root
}

/** Fill a data root with the minimum that looks used. */
function fillDataRoot(root: string, statement = '一道题'): void {
  mkdirSync(join(root, 'home', 'bank', 'problems'), { recursive: true })
  writeFileSync(join(root, 'home', 'bank', 'problems', 'prb-1.json'), `{"statement":"${statement}"}\n`, 'utf8')
  writeFileSync(join(root, 'home', 'setup.json'), '{"schema":1,"onboarding":"done"}\n', 'utf8')
}

describe('ensure-ILE data root location', () => {
  it('keeps the checkout-local root in development', () => {
    const projectRoot = scratch()

    expect(resolveDataRoot({ packaged: false, projectRoot })).toBe(join(projectRoot, LEGACY_DATA_ROOT_NAME))
  })

  it('keeps a packaged build clear of the install directory', () => {
    const projectRoot = scratch()
    const localAppData = scratch()
    const root = resolveDataRoot({ packaged: true, projectRoot, env: { LOCALAPPDATA: localAppData }, platform: 'win32' })

    expect(root).toBe(join(localAppData, PACKAGED_DATA_ROOT_NAME))
    // The uninstaller recurses over the installation; nothing a learner owns may
    // live there, which is what cost a data root on 2026-11-01.
    expect(root.startsWith(projectRoot)).toBe(false)
  })

  it('falls back to APPDATA when LOCALAPPDATA is absent', () => {
    const appData = scratch()

    expect(packagedDataRoot({ packaged: true, projectRoot: scratch(), env: { APPDATA: appData }, platform: 'win32' }))
      .toBe(join(appData, PACKAGED_DATA_ROOT_NAME))
  })

  it('lets the harness point a throwaway root at itself', () => {
    const configured = scratch()
    const root = resolveDataRoot({
      packaged: true,
      projectRoot: scratch(),
      env: { ENSURE_ILE_DATA_ROOT: configured, LOCALAPPDATA: scratch() },
      platform: 'win32',
    })

    expect(root).toBe(configured)
  })
})

describe('moving a pre-alpha3 data root out of the installation', () => {
  it('copies the used root into the packaged location and retires the old one', () => {
    const projectRoot = scratch()
    const target = join(scratch(), PACKAGED_DATA_ROOT_NAME)
    const legacy = legacyDataRoot(projectRoot)
    fillDataRoot(legacy)

    expect(migrateLegacyDataRoot(legacy, target)).toBe('moved')
    expect(readFileSync(join(target, 'home', 'setup.json'), 'utf8')).toContain('"onboarding":"done"')
    expect(existsSync(join(target, 'home', 'bank', 'problems', 'prb-1.json'))).toBe(true)
    // The old directory is retired, not deleted: a learner whose data did not
    // survive needs something to look at.
    expect(existsSync(legacy)).toBe(false)
    expect(existsSync(`${legacy}${MIGRATED_DATA_ROOT_SUFFIX}`)).toBe(true)
  })

  it('leaves an existing packaged root alone', () => {
    const target = join(scratch(), PACKAGED_DATA_ROOT_NAME)
    fillDataRoot(target, '新的那道题')
    const legacy = legacyDataRoot(scratch())
    fillDataRoot(legacy, '旧的那道题')

    expect(migrateLegacyDataRoot(legacy, target)).toBe('present')
    expect(readFileSync(join(target, 'home', 'bank', 'problems', 'prb-1.json'), 'utf8')).toContain('新的那道题')
    expect(existsSync(legacy)).toBe(true)
  })

  it('ignores a data root directory that was never used', () => {
    const legacy = legacyDataRoot(scratch())
    mkdirSync(legacy, { recursive: true })
    const target = join(scratch(), PACKAGED_DATA_ROOT_NAME)

    expect(migrateLegacyDataRoot(legacy, target)).toBe('absent')
    expect(existsSync(target)).toBe(false)
  })

  it('reports a failed copy instead of leaving a half-migrated root that looks done', () => {
    const legacy = legacyDataRoot(scratch())
    fillDataRoot(legacy)
    const blocked = join(scratch(), 'blocked')
    writeFileSync(blocked, 'a file where the parent directory should be\n', 'utf8')

    expect(migrateLegacyDataRoot(legacy, join(blocked, PACKAGED_DATA_ROOT_NAME))).toBe('failed')
    expect(existsSync(join(blocked, `${PACKAGED_DATA_ROOT_NAME}.migrating`))).toBe(false)
    expect(existsSync(join(legacy, 'home', 'setup.json'))).toBe(true)
  })
})
