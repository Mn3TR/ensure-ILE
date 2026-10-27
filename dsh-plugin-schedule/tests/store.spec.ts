import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyPatch,
  defaultScheduleFile,
  emptySchedule,
  loadSchedule,
  readSchedule,
  ScheduleError,
  updateSchedule,
  type ScheduleState,
} from '../src/store.ts'

const created: string[] = []

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ensure-ile-schedule-'))
  created.push(directory)
  return directory
}

const TODAY = '2026-11-02'

function scheduleFile(): string {
  return join(tempDir(), 'schedule.json')
}

function seeded(patch: Parameters<typeof applyPatch>[1]): ScheduleState {
  return applyPatch(emptySchedule(), patch, TODAY)
}

afterEach(() => {
  for (const directory of created.splice(0)) {
    try {
      for (const file of readdirSync(directory)) writeFileSync(join(directory, file), '')
    } catch { /* 目录已经不在 */ }
  }
})

describe('loadSchedule', () => {
  it('文件不存在时给空记录，不算损坏', () => {
    const { state, corrupted } = loadSchedule(join(tempDir(), 'schedule.json'))
    expect(corrupted).toBe(false)
    expect(state.timetable.weekly).toEqual([])
    expect(state.subjects).toEqual([])
  })

  it('空文件当作坏文件，返回空记录而不是抛错', () => {
    const file = scheduleFile()
    writeFileSync(file, '')
    const { state, corrupted } = loadSchedule(file)
    expect(corrupted).toBe(true)
    expect(state.subjects).toEqual([])
  })

  it('坏 JSON 返回空记录并标记损坏', () => {
    const file = scheduleFile()
    writeFileSync(file, '{"schema": 1, "subjects": [')
    const { state, corrupted } = loadSchedule(file)
    expect(corrupted).toBe(true)
    expect(readSchedule(file).subjects).toEqual([])
  })

  it('schema 版本不对也当作坏文件', () => {
    const file = scheduleFile()
    writeFileSync(file, JSON.stringify({ schema: 9 }))
    expect(loadSchedule(file).corrupted).toBe(true)
  })

  it('坏字段逐条丢掉，剩下的照常读出来', () => {
    const file = scheduleFile()
    writeFileSync(file, JSON.stringify({
      schema: 1,
      subjects: [{ id: 'math', name: '数学' }, { id: '', name: '空 id' }, { id: 'chem', name: '化学', bookId: 'renjiao-chem-1' }],
      timetable: { weekly: [{ weekday: 3, slot: 2, subject: 'math' }, { weekday: 9, slot: 1, subject: 'math' }] },
      progress: { math: { section: '第一章 §1.1', at: '2026-10-30' }, chem: { section: '', at: 'x' } },
      exceptions: [{ date: '2026-11-05', kind: 'holiday' }, { date: '明天', kind: 'holiday' }],
    }))
    const { state, corrupted } = loadSchedule(file)
    expect(corrupted).toBe(false)
    expect(state.subjects.map(subject => subject.id)).toEqual(['math', 'chem'])
    expect(state.timetable.weekly).toHaveLength(1)
    expect(state.progress.math?.section).toBe('第一章 §1.1')
    expect(state.progress.chem).toBeUndefined()
    expect(state.exceptions).toHaveLength(1)
  })
})

describe('applyPatch', () => {
  it('只改传了的字段，别的原样不动', () => {
    const before = seeded({
      subjects: [{ id: 'math', name: '数学', bookId: 'renjiaoA-math-1' }, { id: 'chem', name: '化学' }],
      weekly: [{ weekday: 1, slot: 1, subject: 'math' }],
      pace: [{ subject: 'math', perLesson: 2 }],
      progress: [{ subject: 'math', section: '§1.1', at: '2026-10-20' }],
      addExceptions: [{ date: '2026-11-08', kind: 'holiday', note: '运动会' }],
    })

    const after = applyPatch(before, { progress: [{ subject: 'chem', section: '§2.3' }] }, '2026-11-03')
    expect(after.progress.math).toEqual({ section: '§1.1', at: '2026-10-20' })
    expect(after.progress.chem).toEqual({ section: '§2.3', at: '2026-11-03' })
    expect(after.timetable.weekly).toEqual(before.timetable.weekly)
    expect(after.pace.math?.perLesson).toBe(2)
    expect(after.subjects).toEqual(before.subjects)
    expect(after.exceptions).toHaveLength(1)
    expect(after.updatedAt).toBe('2026-11-03')
  })

  it('不给 at 时进度记今天', () => {
    const state = seeded({ subjects: [{ id: 'math', name: '数学' }] })
    const after = applyPatch(state, { progress: [{ subject: 'math', section: '§1.2' }] }, TODAY)
    expect(after.progress.math).toEqual({ section: '§1.2', at: TODAY })
  })

  it('addLessons 覆盖同一天同一节，weekly 整份替换', () => {
    const base = seeded({
      subjects: [{ id: 'math', name: '数学' }, { id: 'chem', name: '化学' }],
      weekly: [{ weekday: 1, slot: 1, subject: 'math' }],
    })
    const added = applyPatch(base, { addLessons: [{ weekday: 1, slot: 1, subject: 'chem' }] }, TODAY)
    expect(added.timetable.weekly).toEqual([{ weekday: 1, slot: 1, subject: 'chem' }])

    const replaced = applyPatch(base, {
      weekly: [{ weekday: 2, slot: 3, subject: 'math' }, { weekday: 2, slot: 1, subject: 'chem' }],
    }, TODAY)
    expect(replaced.timetable.weekly.map(lesson => lesson.slot)).toEqual([1, 3])
  })

  it('删科目会把它的课、节奏、进度一起清掉', () => {
    const base = seeded({
      subjects: [{ id: 'math', name: '数学' }],
      weekly: [{ weekday: 1, slot: 1, subject: 'math' }, { weekday: 1, slot: 2, subject: 'physics' }].filter(lesson => lesson.subject === 'math'),
      pace: [{ subject: 'math', perLesson: 3 }],
      progress: [{ subject: 'math', section: '§1.1' }],
    })
    const after = applyPatch(base, { removeSubjects: ['math'] }, TODAY)
    expect(after.subjects).toEqual([])
    expect(after.timetable.weekly).toEqual([])
    expect(after.pace).toEqual({})
    expect(after.progress).toEqual({})
  })

  it('例外能加能删，重复的不重复记', () => {
    const base = seeded({ subjects: [{ id: 'math', name: '数学' }] })
    const once = applyPatch(base, {
      addExceptions: [{ date: '2026-11-09', kind: 'holiday' }, { date: '2026-11-09', kind: 'holiday' }],
    }, TODAY)
    expect(once.exceptions).toHaveLength(1)

    const removed = applyPatch(once, { removeExceptions: [{ date: '2026-11-09' }] }, TODAY)
    expect(removed.exceptions).toEqual([])
  })

  it('bookId 传空字符串等于解绑', () => {
    const base = seeded({ subjects: [{ id: 'math', name: '数学', bookId: 'renjiaoA-math-1' }] })
    const after = applyPatch(base, { subjects: [{ id: 'math', name: '数学', bookId: '' }] }, TODAY)
    expect(after.subjects[0]?.bookId).toBeUndefined()
  })
})

describe('输入校验', () => {
  const base = seeded({ subjects: [{ id: 'math', name: '数学' }] })

  function messageOf(run: () => unknown): string {
    try {
      run()
    } catch (error) {
      expect(error).toBeInstanceOf(ScheduleError)
      return (error as ScheduleError).message
    }
    throw new Error('本该报错却没报')
  }

  it('weekday 超出 1–7 给一句话', () => {
    const message = messageOf(() => applyPatch(base, { addLessons: [{ weekday: 8, slot: 1, subject: 'math' }] }, TODAY))
    expect(message).toContain('weekday')
    expect(message.endsWith('。')).toBe(true)
    expect(message.split('\n')).toHaveLength(1)
  })

  it('科目不存在时说明要先加科目', () => {
    const message = messageOf(() => applyPatch(base, { progress: [{ subject: 'chem', section: '§1' }] }, TODAY))
    expect(message).toContain('还没录这个科目')
  })

  it('pace 越界给范围', () => {
    expect(messageOf(() => applyPatch(base, { pace: [{ subject: 'math', perLesson: 0 }] }, TODAY))).toContain('1–10')
  })

  it('日期写错给格式', () => {
    expect(messageOf(() => applyPatch(base, { addExceptions: [{ date: '11/09', kind: 'holiday' }] }, TODAY))).toContain('YYYY-MM-DD')
  })

  it('kind 不在三态里给可选值', () => {
    expect(messageOf(() => applyPatch(base, { addExceptions: [{ date: '2026-11-09', kind: 'rest' }] }, TODAY))).toContain('holiday')
  })

  it('空章节名给一句话', () => {
    expect(messageOf(() => applyPatch(base, { progress: [{ subject: 'math', section: '   ' }] }, TODAY))).toContain('不能为空')
  })
})

describe('updateSchedule', () => {
  it('写进文件后能原样读回来，不留 .tmp', () => {
    const file = scheduleFile()
    updateSchedule(file, {
      subjects: [{ id: 'math', name: '数学', bookId: 'renjiaoA-math-1' }],
      weekly: [{ weekday: 1, slot: 1, subject: 'math' }],
      progress: [{ subject: 'math', section: '§1.1', at: '2026-10-30' }],
    }, new Date(2026, 10, 2, 21, 30))
    const state = readSchedule(file)
    expect(state.subjects[0]).toEqual({ id: 'math', name: '数学', bookId: 'renjiaoA-math-1' })
    expect(state.timetable.weekly).toEqual([{ weekday: 1, slot: 1, subject: 'math' }])
    expect(state.updatedAt).toBe(TODAY)

    const files = readdirSync(join(file, '..'))
    expect(files).toEqual(['schedule.json'])
    expect(JSON.parse(readFileSync(file, 'utf8')).schema).toBe(1)
  })

  it('第二次更新保留第一次的内容', () => {
    const file = scheduleFile()
    updateSchedule(file, { subjects: [{ id: 'math', name: '数学' }] }, new Date(2026, 10, 2))
    updateSchedule(file, { subjects: [{ id: 'chem', name: '化学' }] }, new Date(2026, 10, 3))
    const state = readSchedule(file)
    expect(state.subjects.map(subject => subject.id)).toEqual(['math', 'chem'])
    expect(state.updatedAt).toBe('2026-11-03')
  })

  it('坏文件上更新：先当空记录，再写回去', () => {
    const file = scheduleFile()
    writeFileSync(file, 'not json at all')
    const state = updateSchedule(file, { subjects: [{ id: 'math', name: '数学' }] }, new Date(2026, 10, 2))
    expect(state.subjects).toHaveLength(1)
    expect(loadSchedule(file).corrupted).toBe(false)
  })
})

describe('defaultScheduleFile', () => {
  it('用 DSH_HOME', () => {
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = 'C:\\dsh-home'
    try {
      expect(defaultScheduleFile()).toBe(join('C:\\dsh-home', 'schedule', 'schedule.json'))
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    }
  })
})
