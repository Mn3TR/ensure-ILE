import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { desktopRuntimeBuildPaths, desktopRuntimeTargets, expectedDesktopVersion, primaryRuntimeDirectory, verifyDesktopRuntimeTree, verifyPreparedDesktopRuntime, type DesktopRuntimeArch } from '../scripts/prepare-runtime.ts'

const roots: string[] = []
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }) })

const machO = { arm64: Buffer.from('cffaedfe0c00000100000000', 'hex'), x64: Buffer.from('cffaedfe0700000100000000', 'hex') }

interface PayloadOptions {
  readonly manifest?: Record<string, unknown>
  readonly cpu?: DesktopRuntimeArch
  readonly omit?: readonly string[]
}

/** Write one CPU payload with the layout the published tool resolves. */
function writePayload(runtimeRoot: string, arch: DesktopRuntimeArch, options: PayloadOptions = {}): string {
  const directory = primaryRuntimeDirectory(runtimeRoot, arch)
  const files: Record<string, Buffer | string> = {
    'runtime.json': JSON.stringify({ desktopVersion: '2.0.0', platform: 'darwin', arch, payloadDigest: 'a'.repeat(64), node: '24.21.0', pnpm: '11.8.0', ...options.manifest }),
    'dependencies/node/bin/node': machO[options.cpu ?? arch],
    'dependencies/node/node_modules/.keep': '',
    'dependencies/pnpm/bin/pnpm.mjs': 'export {}\n',
  }
  for (const [path, content] of Object.entries(files)) {
    if (options.omit?.includes(path)) continue
    mkdirSync(join(directory, path, '..'), { recursive: true })
    writeFileSync(join(directory, path), content)
  }
  return directory
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'desktop-runtime-tree-'))
  roots.push(root)
  return root
}

it('ships both Darwin CPUs by default or the requested smoke CPU, Windows x64 and nothing elsewhere', () => {
  expect(desktopRuntimeTargets('darwin', {})).toEqual([{ target: 'mac-arm64', arch: 'arm64' }, { target: 'mac-x64', arch: 'x64' }])
  expect(desktopRuntimeTargets('darwin', { DSH_MAC_SMOKE_ARCH: 'arm64' })).toEqual([{ target: 'mac-arm64', arch: 'arm64' }])
  expect(desktopRuntimeTargets('darwin', { DSH_MAC_SMOKE_ARCH: 'x64' })).toEqual([{ target: 'mac-x64', arch: 'x64' }])
  expect(desktopRuntimeTargets('win32', {})).toEqual([{ target: 'win-x64', arch: 'x64' }])
  expect(desktopRuntimeTargets('linux', {})).toEqual([])
})

it('lays out each CPU payload under the build directory', () => {
  expect(desktopRuntimeBuildPaths('/desktop')).toEqual({ runtime: join('/desktop', '.desktop-build', 'runtime'), downloads: join('/desktop', '.desktop-build', 'downloads') })
  expect(primaryRuntimeDirectory('/resources/runtime', 'x64')).toBe(join('/resources/runtime', 'x64', 'primary-runtime'))
})

it('reads the product version from the package manifest', () => {
  const root = fixture()
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '2.0.17' }))
  expect(expectedDesktopVersion(root)).toBe('2.0.17')
})

it('accepts a complete two-CPU tree and reports each manifest', () => {
  const root = fixture()
  const arm64 = writePayload(root, 'arm64')
  const x64 = writePayload(root, 'x64')
  expect(verifyDesktopRuntimeTree(root, 'darwin', '2.0.0')).toEqual([
    { arch: 'arm64', directory: arm64, manifest: expect.objectContaining({ platform: 'darwin', arch: 'arm64', node: '24.21.0', pnpm: '11.8.0' }) },
    { arch: 'x64', directory: x64, manifest: expect.objectContaining({ platform: 'darwin', arch: 'x64' }) },
  ])
  expect(verifyDesktopRuntimeTree(root, 'linux', '2.0.0')).toEqual([])
})

it('re-checks the prepared build tree against the package manifest before packaging', () => {
  const root = fixture()
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '2.0.0' }))
  const runtime = desktopRuntimeBuildPaths(root).runtime
  expect(verifyPreparedDesktopRuntime(root, 'linux')).toEqual([])
  expect(() => verifyPreparedDesktopRuntime(root, 'darwin')).toThrow('missing arm64 payload manifest')
  writePayload(runtime, 'arm64')
  writePayload(runtime, 'x64')
  expect(verifyPreparedDesktopRuntime(root, 'darwin').map(payload => payload.arch)).toEqual(['arm64', 'x64'])
})

it('rejects a missing CPU, another version, a payload without Node, or a foreign CPU slice', () => {
  const missing = fixture()
  writePayload(missing, 'arm64')
  expect(() => verifyDesktopRuntimeTree(missing, 'darwin', '2.0.0')).toThrow('missing x64 payload manifest')
  const version = fixture()
  writePayload(version, 'arm64')
  writePayload(version, 'x64', { manifest: { desktopVersion: '2.0.1' } })
  expect(() => verifyDesktopRuntimeTree(version, 'darwin', '2.0.0')).toThrow('declares version 2.0.1, expected 2.0.0')
  const swapped = fixture()
  writePayload(swapped, 'arm64', { manifest: { arch: 'x64' } })
  expect(() => verifyDesktopRuntimeTree(swapped, 'darwin', '2.0.0')).toThrow('declares darwin x64, expected darwin arm64')
  const noNode = fixture()
  writePayload(noNode, 'arm64', { manifest: { node: undefined } })
  expect(() => verifyDesktopRuntimeTree(noNode, 'darwin', '2.0.0')).toThrow('must declare node and pnpm')
  const slice = fixture()
  writePayload(slice, 'arm64')
  writePayload(slice, 'x64', { cpu: 'arm64' })
  expect(() => verifyDesktopRuntimeTree(slice, 'darwin', '2.0.0')).toThrow('expected a thin x64 executable')
})

it('rejects missing entry points', () => {
  const node = fixture()
  writePayload(node, 'arm64', { omit: ['dependencies/node/bin/node'] })
  writePayload(node, 'x64')
  expect(() => verifyDesktopRuntimeTree(node, 'darwin', '2.0.0')).toThrow('missing arm64 Node executable')
  const pnpm = fixture()
  writePayload(pnpm, 'arm64')
  writePayload(pnpm, 'x64', { omit: ['dependencies/pnpm/bin/pnpm.mjs'] })
  expect(() => verifyDesktopRuntimeTree(pnpm, 'darwin', '2.0.0')).toThrow('missing x64 pnpm entry')
  const packages = fixture()
  writePayload(packages, 'arm64', { omit: ['dependencies/node/node_modules/.keep'] })
  expect(() => verifyDesktopRuntimeTree(packages, 'darwin', '2.0.0')).toThrow('missing arm64 Node package directory')
})
