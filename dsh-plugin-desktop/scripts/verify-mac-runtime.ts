/** Check the bundled interpreter payloads inside a mounted Desktop application. */
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { primaryRuntimeEntries } from './primary-runtime.ts'
import { expectedDesktopVersion, verifyDesktopRuntimeTree } from './prepare-runtime.ts'
import { readSignedEntitlements } from './sign-runtime.ts'

const desktopRoot = resolve(import.meta.dirname, '..')

/** Runs one command and returns both output streams; rejects a non-zero exit. */
export type RunCommand = (command: string, args: readonly string[]) => string

const runCommand: RunCommand = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} ${result.signal ?? `exited with ${String(result.status)}`}: ${`${result.stdout}${result.stderr}`.trim()}`)
  return `${result.stdout}${result.stderr}`
}

/**
 * Verify every payload of a mounted application: manifests, files and CPU slices for both CPUs;
 * the Node version and pnpm on the host's CPU; and, for a signed release, hardened-runtime
 * signatures with the upstream entitlement policy: JIT for Node, unsigned executable memory only
 * for x64 Node.
 * @param appPath - Mounted application bundle.
 * @param signed - Whether the release carries Developer ID signatures.
 * @param run - Command executor.
 * @param readEntitlements - Entitlement reader for one signed file.
 */
export function verifyDesktopMacRuntime(
  appPath: string, signed: boolean, run: RunCommand = runCommand, readEntitlements: (file: string) => Record<string, unknown> = readSignedEntitlements,
): void {
  const runtimeRoot = join(appPath, 'Contents', 'Resources', 'runtime')
  for (const { arch, directory, manifest } of verifyDesktopRuntimeTree(runtimeRoot, 'darwin', expectedDesktopVersion(desktopRoot))) {
    const entries = primaryRuntimeEntries(directory, manifest)
    if (signed) {
      run('/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', entries.node])
      if (!/\bflags=0x[0-9a-f]+\(runtime\)(?:\s|$)/iu.test(run('/usr/bin/codesign', ['--display', '--verbose=4', entries.node]))) {
        throw new Error(`Desktop runtime: ${entries.node} is not signed with the hardened runtime`)
      }
      const node = readEntitlements(entries.node)
      if (node['com.apple.security.cs.allow-jit'] !== true) throw new Error(`Desktop runtime: ${entries.node} must carry com.apple.security.cs.allow-jit`)
      if ((node['com.apple.security.cs.allow-unsigned-executable-memory'] === true) !== (arch === 'x64')) {
        throw new Error(`Desktop runtime: ${entries.node} must carry com.apple.security.cs.allow-unsigned-executable-memory only for x64`)
      }
    }
    if (arch !== process.arch) continue
    run(entries.node, ['-e', `if (process.versions.node !== ${JSON.stringify(manifest.node)}) process.exit(1)`])
    run(entries.node, [entries.pnpm, '--version'])
  }
}
