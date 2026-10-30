import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SETUP_PRESET, shouldRegisterSetup } from '../src/presets.ts'
import { readState, updateState } from '../src/state.ts'

let dir = ''
const stateFile = () => join(dir, 'setup.json')

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ile-setup-preset-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('SETUP_PRESET', () => {
  it('starts in the setup mode and mounts the core with the setup row', () => {
    expect(SETUP_PRESET.id).toBe('setup')
    expect(SETUP_PRESET.name).toBe('开学')
    expect(SETUP_PRESET.plugins).toEqual([
      { name: 'dsh-plugin-coreset', config: { mode: 'setup' } },
      { name: 'dsh-plugin-setup' },
    ])
  })
})

describe('shouldRegisterSetup', () => {
  it('keeps the preset while nothing was written', () => {
    expect(readState(stateFile()).onboarding).toBe('pending')
    expect(shouldRegisterSetup(stateFile())).toBe(true)
  })

  it('keeps it while onboarding is still pending', () => {
    updateState(stateFile(), { grade: '高一' })
    expect(shouldRegisterSetup(stateFile())).toBe(true)
  })

  it('drops it once onboarding is done', () => {
    updateState(stateFile(), { onboarding: 'done', next: '明天先看错题本' })
    expect(shouldRegisterSetup(stateFile())).toBe(false)
  })
})
