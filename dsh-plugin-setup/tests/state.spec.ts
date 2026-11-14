import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readProfile, readProfileFile, writeProfileFile } from 'dsh-plugin-memory/profile'
import { backfillProfile, defaultStateFile, readState, updateState } from '../src/state.ts'

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

describe('student profile synchronization', () => {
  it('makes each collected fact readable by the profile API used in later modes', () => {
    const path = file()
    const home = dirname(path)
    updateState(path, { grade: '高一', preference: '喜欢先想，偏几何' })
    expect(readProfileFile('preference', home)).toBe('喜欢先想，偏几何')
    updateState(path, { schedule: '周一有晚自习', rhythm: '晚上八点到家' })
    expect(readProfile(home)).toEqual({
      grade: '高一', schedule: '周一有晚自习', rhythm: '晚上八点到家', preference: '喜欢先想，偏几何',
    })
  })

  it('backfills older setup facts without overwriting a profile refined later', () => {
    const path = file()
    const home = dirname(path)
    writeFileSync(path, JSON.stringify({ schema: 1, onboarding: 'pending', got: {
      grade: '高一', preference: '旧偏好',
    } }))
    writeProfileFile('preference', '后来补充：先画图再列式', home)
    updateState(path, { onboarding: 'done', next: '先发一道题' })
    expect(readProfileFile('grade', home)).toBe('高一')
    expect(readProfileFile('preference', home)).toBe('后来补充：先画图再列式')
  })

  it('backfills completed onboarding without reopening it or replacing a later profile edit', () => {
    const path = file()
    const home = dirname(path)
    const old = { schema: 1, onboarding: 'done', got: { grade: '高一', preference: '旧偏好', schedule: '未填' }, next: '先发一道题' }
    writeFileSync(path, JSON.stringify(old))
    writeProfileFile('preference', '后来补充的偏好', home)
    backfillProfile(path)
    expect(readProfileFile('grade', home)).toBe('高一')
    expect(readProfileFile('preference', home)).toBe('后来补充的偏好')
    expect(readProfileFile('schedule', home)).toBeUndefined()
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(old)
    expect(readState(path).onboarding).toBe('done')
  })

  it('applies an explicit correction while preserving unrelated profile columns', () => {
    const path = file()
    const home = dirname(path)
    updateState(path, { grade: '高一', preference: '偏代数' })
    writeProfileFile('preference', '更详细的解题偏好', home)
    updateState(path, { grade: '高二' })
    expect(readProfileFile('grade', home)).toBe('高二')
    expect(readProfileFile('preference', home)).toBe('更详细的解题偏好')
  })

  it('keeps the profile in its explicit home when the progress file is configured elsewhere', () => {
    const path = file()
    const home = join(dirname(path), 'student-home')
    updateState(path, { preference: '先想再动笔' }, new Date(), home)
    expect(readProfileFile('preference', home)).toBe('先想再动笔')
    expect(readProfileFile('preference', dirname(path))).toBeUndefined()
  })

  it('does not mark onboarding done if a profile column cannot be saved', () => {
    const path = file()
    mkdirSync(join(dirname(path), 'profile', 'grade.md'), { recursive: true })
    expect(() => updateState(path, { grade: '高一', onboarding: 'done', next: '先发一道题' })).toThrow()
    expect(readState(path)).toEqual({ schema: 1, onboarding: 'pending', got: {} })
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