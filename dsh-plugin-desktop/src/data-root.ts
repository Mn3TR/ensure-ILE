/**
 * Where ensure-ILE keeps a learner's data.
 *
 * A packaged build used to keep everything inside the install directory
 * (`<install>\.ensure-ile`), which put the problem bank, memory and session
 * history under `$INSTDIR`. Every overwrite install runs the previously
 * installed uninstaller, and that uninstaller recurses over `$INSTDIR` — the
 * data only survived because `build/installer.nsh` parked it beside the install
 * directory first and moved it back afterwards. That hand-off depends on a
 * marker file in `%TEMP%` seen by a binary built months earlier, and on
 * 2026-11-01 it failed: upgrading 0.1.0-alpha1 to alpha2 deleted a learner's
 * whole data root (setup answers, problem bank, sessions, memory).
 *
 * A packaged build therefore keeps its data under `%LOCALAPPDATA%` instead,
 * which is outside the install directory by construction: install and uninstall
 * cannot reach it, and a broken installer can no longer cost a term of work. An
 * existing install-directory data root is copied over once, on the first launch
 * after the upgrade, and left behind as `.ensure-ile-migrated`.
 *
 * Development keeps the checkout-local `.ensure-ile` — there the directory is
 * disposable and lives next to the code being edited.
 *
 * @module dsh-plugin-desktop/data-root
 */

import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/** Directory a packaged build creates under the local application data folder. */
export const PACKAGED_DATA_ROOT_NAME = 'ensure-ILE-data'

/** Directory name of the data root used before 2026-11-01. */
export const LEGACY_DATA_ROOT_NAME = '.ensure-ile'

/** Suffix the old data root keeps once it has been copied to the new location. */
export const MIGRATED_DATA_ROOT_SUFFIX = '-migrated'

/** Everything {@link resolveDataRoot} needs, injected so it stays testable. */
export interface DataRootOptions {
  /** `app.isPackaged`: the executable runs from an installation. */
  readonly packaged: boolean
  /** Executable directory when packaged, the workspace root in development. */
  readonly projectRoot: string
  /** `process.env`; only `ENSURE_ILE_DATA_ROOT` and the platform folders matter. */
  readonly env?: NodeJS.ProcessEnv
  /** `process.platform`; decides which platform folder stands in for `%LOCALAPPDATA%`. */
  readonly platform?: NodeJS.Platform
}

/** Outcome of {@link migrateLegacyDataRoot}. */
export type DataRootMigration = 'moved' | 'absent' | 'present' | 'failed'

/**
 * The per-user folder a packaged build keeps its data in.
 *
 * `%LOCALAPPDATA%` on Windows (roaming would sync hundreds of megabytes of
 * session history), `~/Library/Application Support` on macOS, `$XDG_DATA_HOME`
 * elsewhere.
 * @param options - packaging facts and the environment to read.
 * @returns absolute path of the packaged data root.
 */
export function packagedDataRoot(options: DataRootOptions): string {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const base = platform === 'win32'
    ? firstNonEmpty(env.LOCALAPPDATA, env.APPDATA, join(homedir(), 'AppData', 'Local'))
    : platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : firstNonEmpty(env.XDG_DATA_HOME, join(homedir(), '.local', 'share'))
  return join(base, PACKAGED_DATA_ROOT_NAME)
}

/**
 * The data root releases up to 0.1.0-alpha2 kept beside the executable.
 * @param projectRoot - executable directory of the installed copy.
 * @returns absolute path of the legacy data root.
 */
export function legacyDataRoot(projectRoot: string): string {
  return join(projectRoot, LEGACY_DATA_ROOT_NAME)
}

/**
 * Pick the data root for this launch.
 *
 * `ENSURE_ILE_DATA_ROOT` wins: the UI test harness and diagnostic runs point a
 * throwaway root at themselves, and a packaged build must never know better.
 * @param options - packaging facts and the environment to read.
 * @returns absolute path of the data root this launch uses.
 */
export function resolveDataRoot(options: DataRootOptions): string {
  const env = options.env ?? process.env
  const configured = env.ENSURE_ILE_DATA_ROOT?.trim()
  if (configured !== undefined && configured.length > 0) return resolve(configured)
  return options.packaged ? packagedDataRoot(options) : legacyDataRoot(options.projectRoot)
}

/**
 * Copy an install-directory data root into the packaged one, once.
 *
 * The copy goes through `<target>.migrating` and is renamed into place only
 * after it lands whole: a half-copied data root that looks present would make
 * every later launch skip the migration. The old directory is renamed rather
 * than deleted, so a learner whose data did not survive has something to look
 * at, and a failed rename (an open handle) is not a reason to fail the launch.
 * @param legacy - the old data root, typically {@link legacyDataRoot}.
 * @param target - the packaged data root, typically {@link packagedDataRoot}.
 * @returns what happened, for the caller to log.
 */
export function migrateLegacyDataRoot(legacy: string, target: string): DataRootMigration {
  if (existsSync(target)) return 'present'
  // `home` is the marker of a data root that was actually used: the installer
  // creates the directory alone, and an empty one carries nothing to keep.
  if (!existsSync(join(legacy, 'home'))) return 'absent'
  const staging = `${target}.migrating`
  try {
    mkdirSync(dirname(target), { recursive: true })
    rmSync(staging, { recursive: true, force: true })
    cpSync(legacy, staging, { recursive: true })
    if (!existsSync(join(staging, 'home'))) {
      rmSync(staging, { recursive: true, force: true })
      return 'failed'
    }
    renameSync(staging, target)
  } catch {
    rmSync(staging, { recursive: true, force: true })
    return 'failed'
  }
  try {
    renameSync(legacy, `${legacy}${MIGRATED_DATA_ROOT_SUFFIX}`)
  } catch {
    // The data is in its new home; leaving the old copy in place only costs disk.
  }
  return 'moved'
}

/**
 * First value that is set to something other than whitespace.
 * @param candidates - values in priority order.
 * @returns the first usable value, or the last candidate as a fallback.
 */
function firstNonEmpty(...candidates: (string | undefined)[]): string {
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate.trim().length > 0) return candidate
  }
  return ''
}
