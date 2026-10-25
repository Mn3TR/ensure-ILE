import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultStateFile, readState, updateState } from '../src/state.ts'

const roots: string[] = []
function file(): string {
  const root = mkdtempSync(join(tmpdir(), 'ensure-ile-setup-'))
  roots.push(root)
  return join(root, 'setup.json')
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('readState', () => {
  it('starts pending with nothing collected', () => {
    expect(readState(file())).toEqual({ schema: 1, onboarding: 'pending', got: {} })
  })
  it('treats a corrupt file as a fresh start', () => {
    const path = file()
    writeFileSync(path, '{not json')
    expect(readState(path).onboarding).toBe('pending')
  })
  it('drops empty and non-string facts', () => {
    const path = file()
    writeFileSync(path, JSON.stringify({ onboarding: 'done', got: { grade: '', schedule: 42, rhythm: '十点到家' } }))
    const state = readState(path)
    expect(state.onboarding).toBe('done')
    expect(state.got).toEqual({ rhythm: '十点到家' })
  })
})

describe('updateState', () => {
  it('writes one field at a time without dropping earlier ones', () => {
    const path = file()
    updateState(path, { grade: '高一' }, new Date('2026-10-25T00:00:00Z'))
    const state = updateState(path, { schedule: '周一到周五，晚自习到九点半' }, new Date('2026-10-25T00:01:00Z'))
    expect(state.got.grade).toBe('高一')
    expect(state.got.schedule).toBe('周一到周五，晚自习到九点半')
    expect(state.updatedAt).toBe('2026-10-25T00:01:00.000Z')
    expect(JSON.parse(readFileSync(path, 'utf8')).got.grade).toBe('高一')
  })
  it('finishes only when the next step is written', () => {
    const path = file()
    updateState(path, { grade: '高一', onboarding: 'done', next: '明天先做一道函数题' })
    const state = readState(path)
    expect(state.onboarding).toBe('done')
    expect(state.next).toBe('明天先做一道函数题')
  })
  it('keeps the earlier next step when a later write omits it', () => {
    const path = file()
    updateState(path, { next: '先做一道函数题' })
    expect(updateState(path, { grade: '高一' }).next).toBe('先做一道函数题')
  })
})

describe('defaultStateFile', () => {
  it('hangs off DSH_HOME', () => {
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = 'C:/data/home'
    try {
      expect(defaultStateFile()).toBe(join('C:/data/home', 'setup.json'))
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    }
  })
})