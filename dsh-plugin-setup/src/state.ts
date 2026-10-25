/**
 * Progress record for the first-run conversation.
 *
 * Kept apart from the plugin row so it carries no Cordis or tool dependency:
 * the store is testable on its own and the row is only wiring.
 * @module dsh-plugin-setup/state
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Whether the onboarding conversation has finished. */
export const ONBOARDING_STATES = ['pending', 'done'] as const
export type OnboardingState = (typeof ONBOARDING_STATES)[number]

/** The four facts the conversation collects; every field is optional until said. */
export interface SetupFacts {
  grade?: string
  schedule?: string
  rhythm?: string
  preference?: string
}

/** The whole progress record. */
export interface SetupState {
  schema: 1
  onboarding: OnboardingState
  got: SetupFacts
  /** What happens next; the conversation is not finished without it. */
  next?: string
  updatedAt?: string
}

/** One write into the progress record; absent keys are left alone. */
export interface SetupPatch extends SetupFacts {
  onboarding?: string
  next?: string
}

const FACT_KEYS = ['grade', 'schedule', 'rhythm', 'preference'] as const

/**
 * Resolve the default progress file under the Harness home.
 * @returns the absolute path.
 */
export function defaultStateFile(): string {
  const home = process.env.DSH_HOME?.trim()
  return home !== undefined && home.length > 0 ? join(home, 'setup.json') : join(process.cwd(), 'setup.json')
}

/**
 * Read the progress record, or an empty pending one.
 * @param file - absolute path.
 * @returns the record; a corrupt file starts over rather than blocking onboarding.
 */
export function readState(file: string): SetupState {
  if (!existsSync(file)) return { schema: 1, onboarding: 'pending', got: {} }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    // A broken progress file costs one repeated question; refusing to open the
    // conversation would cost the whole onboarding.
    return { schema: 1, onboarding: 'pending', got: {} }
  }
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<SetupState>
  const got: SetupFacts = {}
  const source = (typeof value.got === 'object' && value.got !== null ? value.got : {}) as SetupFacts
  for (const key of FACT_KEYS) {
    const entry = source[key]
    if (typeof entry === 'string' && entry.length > 0) got[key] = entry
  }
  return {
    schema: 1,
    onboarding: value.onboarding === 'done' ? 'done' : 'pending',
    got,
    ...(typeof value.next === 'string' ? { next: value.next } : {}),
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
  }
}

/**
 * Apply one patch and persist it atomically.
 * @param file - absolute path.
 * @param patch - the fields to write.
 * @param now - clock injection for tests.
 * @returns the merged record.
 */
export function updateState(file: string, patch: SetupPatch, now: Date = new Date()): SetupState {
  const current = readState(file)
  const got: SetupFacts = { ...current.got }
  for (const key of FACT_KEYS) {
    const value = patch[key]
    if (value !== undefined) got[key] = value
  }
  const onboarding: OnboardingState = patch.onboarding === 'done'
    ? 'done'
    : patch.onboarding === 'pending' ? 'pending' : current.onboarding
  const next: SetupState = {
    schema: 1,
    onboarding,
    got,
    ...(patch.next !== undefined
      ? { next: patch.next }
      : current.next !== undefined ? { next: current.next } : {}),
    updatedAt: now.toISOString(),
  }
  mkdirSync(dirname(file), { recursive: true })
  const temporary = file + '.tmp'
  writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n')
  renameSync(temporary, file)
  return next
}
