import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  machOArchitectures, parsePrimaryRuntime, parsePrimaryRuntimeLock, primaryRuntimeEntries, primaryRuntimePayloadDigest,
  readPrimaryRuntimeLock, smokePrimaryRuntime, type PrimaryRuntimeLock,
} from '../scripts/primary-runtime.ts'

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> }
const lock = readPrimaryRuntimeLock()
const mutableLock = (): Mutable<PrimaryRuntimeLock> => structuredClone(lock) as Mutable<PrimaryRuntimeLock>

it('pins the Darwin and Windows targets Desktop packages', () => {
  for (const target of ['mac-arm64', 'mac-x64', 'win-x64'] as const) expect(lock.targets[target].nodeSha256).toMatch(/^[a-f0-9]{64}$/u)
})

it('rejects a lock missing a pinned target or carrying a malformed digest', () => {
  const missing = mutableLock()
  Reflect.deleteProperty(missing.targets, 'mac-x64')
  expect(() => parsePrimaryRuntimeLock(missing)).toThrow('malformed target mac-x64')
  const corrupt = mutableLock()
  corrupt.targets['win-x64'].nodeSha256 = 'not a digest'
  expect(() => parsePrimaryRuntimeLock(corrupt)).toThrow('malformed target win-x64')
  const versions = mutableLock()
  versions.pythonRelease = 'latest'
  expect(() => parsePrimaryRuntimeLock(versions)).toThrow('malformed interpreter versions')
})

it('keeps a target payload identity independent of other target archives', () => {
  const changed = mutableLock()
  changed.targets['win-x64'].nodeSha256 = 'a'.repeat(64)
  expect(primaryRuntimePayloadDigest('mac-arm64', changed, '11.7.0')).toBe(primaryRuntimePayloadDigest('mac-arm64', lock, '11.7.0'))
  expect(primaryRuntimePayloadDigest('win-x64', changed, '11.7.0')).not.toBe(primaryRuntimePayloadDigest('win-x64', lock, '11.7.0'))
})

it('invalidates payload identity for Node and package-manager changes', () => {
  const node = mutableLock()
  node.nodeVersion = '24.21.1'
  const original = primaryRuntimePayloadDigest('mac-arm64', lock, '11.7.0')
  expect(primaryRuntimePayloadDigest('mac-arm64', node, '11.7.0')).not.toBe(original)
  expect(primaryRuntimePayloadDigest('mac-arm64', lock, '11.7.1')).not.toBe(original)
})

it('parses a manifest carrying Node and pnpm and rejects one without them', () => {
  expect(parsePrimaryRuntime({ desktopVersion: '2.0.18', platform: 'win32', arch: 'x64', node: '24.21.0', pnpm: '11.8.0' }))
    .toEqual({ desktopVersion: '2.0.18', platform: 'win32', arch: 'x64', node: '24.21.0', pnpm: '11.8.0' })
  expect(() => parsePrimaryRuntime({ desktopVersion: '2.0.18', platform: 'win32', arch: 'x64', node: '24.21.0' }))
    .toThrow('must declare node and pnpm')
})

it('resolves the payload entry points of one platform', () => {
  const manifest = { desktopVersion: '2.0.18', platform: 'win32', arch: 'x64', node: '24.21.0', pnpm: '11.8.0' }
  expect(primaryRuntimeEntries('payload', manifest)).toEqual({
    node: join('payload', 'dependencies', 'node', 'bin', 'node.exe'),
    nodePackages: join('payload', 'dependencies', 'node', 'node_modules'),
    pnpm: join('payload', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'),
  })
})

it('reports a payload of another platform or CPU as not executed unless a launcher runs it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-foreign-runtime-'))
  try {
    await writeFile(join(root, 'runtime.json'), JSON.stringify({ desktopVersion: '1.0.0', platform: process.platform === 'win32' ? 'darwin' : 'win32', arch: 'x64', node: '24.21.0', pnpm: '11.8.0' }))
    expect(smokePrimaryRuntime(root)).toBe(false)
    await writeFile(join(root, 'runtime.json'), JSON.stringify({ desktopVersion: '1.0.0', platform: process.platform, arch: process.arch === 'x64' ? 'arm64' : 'x64', node: '24.21.0', pnpm: '11.8.0' }))
    expect(smokePrimaryRuntime(root)).toBe(false)
    // A launcher commits to executing the foreign CPU; the missing entry is then an error.
    expect(() => { smokePrimaryRuntime(root, { launcher: ['/usr/bin/arch', '-x86_64'] }) }).toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('reads the CPU of thin Mach-O files and every slice of a fat archive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-mach-o-'))
  try {
    await writeFile(join(root, 'arm64'), Buffer.from('cffaedfe0c000001000000000200000000000000', 'hex'))
    await writeFile(join(root, 'x64'), Buffer.from('cffaedfe07000001000000000200000000000000', 'hex'))
    await writeFile(join(root, 'fat'), Buffer.concat([Buffer.from('cafebabe00000002', 'hex'),
      Buffer.from('01000007000000030000100000001000000000000', 'hex').subarray(0, 20), Buffer.from('0100000c000000000000200000001000000000000', 'hex').subarray(0, 20)]))
    await writeFile(join(root, 'script.py'), 'print()\n')
    await writeFile(join(root, 'short'), Buffer.from('cffa', 'hex'))
    expect(machOArchitectures(join(root, 'arm64'))).toEqual(['arm64'])
    expect(machOArchitectures(join(root, 'x64'))).toEqual(['x64'])
    expect(machOArchitectures(join(root, 'fat'))).toEqual(['x64', 'arm64'])
    expect(machOArchitectures(join(root, 'script.py'))).toEqual([])
    expect(machOArchitectures(join(root, 'short'))).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})
