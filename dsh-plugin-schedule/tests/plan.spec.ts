import { describe, expect, it } from 'vitest'
import { addDays, weekdayOf } from '../src/dates.ts'
import { applyPatch, emptySchedule, type ScheduleState } from '../src/store.ts'
import {
  MINUTES_PER_PROBLEM,
  STALE_DAYS,
  nextLessonDay,
  plan,
  renderPlan,
  type BankProblem,
  type BankReader,
  type BookReader,
  type TextbookSection,
} from '../src/plan.ts'

const TODAY = '2026-11-02'
const TOMORROW = addDays(TODAY, 1)

const SECTIONS: TextbookSection[] = [
  { level: 1, title: '1.1 集合的概念', pdfPage: 3, endPage: 6 },
  { level: 1, title: '1.2 集合间的关系', pdfPage: 7, endPage: 10 },
  { level: 1, title: '1.3 集合的运算', pdfPage: 11, endPage: 15 },
]

const BOOK = { id: 'renjiaoA-math-1', title: '人教A版数学必修一', textbookOffset: 2 }

function fakeBook(): BookReader {
  return {
    book: id => (id === BOOK.id ? BOOK : undefined),
    startSection: id => (id === BOOK.id ? SECTIONS[0] : undefined),
    nextSection: (id, afterTitle) => {
      if (id !== BOOK.id) return undefined
      const index = SECTIONS.findIndex(section => section.title === afterTitle)
      if (index < 0) return undefined
      return SECTIONS[index + 1]
    },
  }
}

function fakeBank(records: BankProblem[]): BankReader {
  return { list: () => ({ records, skipped: [] }) }
}

function record(over: Partial<BankProblem> & { id: string }): BankProblem {
  return { subject: 'math', status: 'review', ...over }
}

function build(patch: Parameters<typeof applyPatch>[1]): ScheduleState {
  return applyPatch(emptySchedule(), patch, TODAY)
}

const tomorrowLesson = build({
  subjects: [{ id: 'math', name: '数学', bookId: BOOK.id }],
  weekly: [{ weekday: weekdayOf(TOMORROW), slot: 3, subject: 'math' }],
  progress: [{ subject: 'math', section: '1.1 集合的概念', at: TODAY }],
})

describe('到期优先排序', () => {
  it('先按 nextAt 再按科目顺序，后面才轮到做错的和卡住的', () => {
    const bank = fakeBank([
      record({ id: 'later', review: { nextAt: '2026-11-02T09:00:00.000Z' } }),
      record({ id: 'wrong-one', status: 'new', work: { attempts: [{ verdict: 'wrong' }] } }),
      record({ id: 'stuck', status: 'guide' }),
      record({ id: 'earlier', review: { nextAt: '2026-11-02T00:00:00.000Z' } }),
    ])
    const result = plan(tomorrowLesson, { bank, textbook: fakeBook(), today: TODAY, minutes: 40 })
    expect(result.budget).toBe(5)
    expect(result.review.map(item => item.id)).toEqual(['earlier', 'later', 'wrong-one', 'stuck'])
    expect(result.review.map(item => item.reason)).toEqual(['due', 'due', 'wrong', 'stuck'])
  })

  it('到期的是今天也算到期', () => {
    const bank = fakeBank([record({ id: 'today', review: { nextAt: TODAY + 'T23:00:00.000Z' } })])
    const result = plan(emptySchedule(), { bank, today: TODAY, minutes: 25 })
    expect(result.review.map(item => item.id)).toEqual(['today'])
  })

  it('mastered 和 parked 不进复习也不进遗留', () => {
    const bank = fakeBank([
      record({ id: 'done', status: 'mastered', review: { nextAt: '2026-10-01T00:00:00.000Z' } }),
      record({ id: 'parked', status: 'parked', work: { attempts: [{ verdict: 'wrong' }, { verdict: 'wrong' }] } }),
    ])
    const result = plan(emptySchedule(), { bank, today: TODAY, minutes: 25 })
    expect(result.review).toEqual([])
    expect(result.leftover).toEqual([])
  })
})

describe('minutes 预算', () => {
  it('按每题 8 分钟截断，剩下的报数量', () => {
    const bank = fakeBank([
      record({ id: 'a', review: { nextAt: '2026-11-01T00:00:00.000Z' } }),
      record({ id: 'b', review: { nextAt: '2026-11-02T00:00:00.000Z' } }),
      record({ id: 'c', review: { nextAt: '2026-11-02T23:00:00.000Z' } }),
    ])
    const result = plan(emptySchedule(), { bank, today: TODAY, minutes: MINUTES_PER_PROBLEM })
    expect(result.budget).toBe(1)
    expect(result.review).toHaveLength(1)
    expect(result.reviewOverflow).toBe(2)
    expect(renderPlan(result)).toContain('还有 2 道排不进今天')
  })

  it('30 分钟给 3 道', () => {
    const bank = fakeBank([
      record({ id: 'a', review: { nextAt: '2026-11-01T00:00:00.000Z' } }),
      record({ id: 'b', review: { nextAt: '2026-11-01T00:00:00.000Z' } }),
      record({ id: 'c', review: { nextAt: '2026-11-01T00:00:00.000Z' } }),
      record({ id: 'd', review: { nextAt: '2026-11-01T00:00:00.000Z' } }),
    ])
    const result = plan(emptySchedule(), { bank, today: TODAY, minutes: 24 })
    expect(result.review).toHaveLength(3)
    expect(result.reviewOverflow).toBe(1)
  })
})

describe('空数据也给下一步', () => {
  it('课表为空时明说缺课表，复习和历史遗留照常列', () => {
    const bank = fakeBank([
      record({ id: 'due-today', review: { nextAt: TODAY + 'T08:00:00.000Z' } }),
      record({ id: 'old', updatedAt: '2026-10-01T10:00:00.000Z' }),
    ])
    const result = plan(emptySchedule(), { bank, today: TODAY, minutes: 25 })
    expect(result.upcoming).toEqual([])
    expect(result.prep).toEqual([])
    expect(result.review.map(item => item.id)).toEqual(['due-today'])
    expect(result.leftover.map(item => item.id)).toEqual(['old'])
    const text = renderPlan(result)
    expect(text).toContain('还没录课表')
    expect(text).toContain('先录课表和进度；复习这块现在就能用')
    expect(text).toContain('due-today')
  })

  it('连题库都没有时也不炸，只说题库是空的', () => {
    const result = plan(emptySchedule(), { bank: fakeBank([]), today: TODAY, minutes: 25 })
    expect(result.review).toEqual([])
    expect(result.notes.some(note => note.includes('题库还是空的'))).toBe(true)
  })

  it('科目有但进度没录时明说', () => {
    const state = build({
      subjects: [{ id: 'math', name: '数学', bookId: BOOK.id }],
      weekly: [{ weekday: weekdayOf(TOMORROW), slot: 1, subject: 'math' }],
    })
    const result = plan(state, { textbook: fakeBook(), today: TODAY, minutes: 25 })
    expect(result.notes.some(note => note.includes('还没录进度'))).toBe(true)
    expect(result.upcoming[0]?.from).toBeUndefined()
    expect(result.upcoming[0]?.sections).toEqual(['1.1 集合的概念'])
  })
})

describe('下一次课与预习', () => {
  it('明天有课：给出日期、节次和章节', () => {
    const result = plan(tomorrowLesson, { textbook: fakeBook(), today: TODAY, minutes: 25 })
    expect(result.upcoming).toHaveLength(1)
    const lesson = result.upcoming[0]
    expect(lesson?.date).toBe(TOMORROW)
    expect(lesson?.dayLabel).toBe('明天')
    expect(lesson?.slot).toBe(3)
    expect(lesson?.from).toBe('1.1 集合的概念')
    expect(lesson?.to).toBe('1.2 集合间的关系')
    expect(result.prep[0]?.bookTitle).toBe(BOOK.title)
    expect(result.prep[0]?.pdfPages).toBe('7–10')
    expect(result.prep[0]?.bookPages).toBe('5–8')
  })

  it('pace.perLesson 大于 1 时推进 N 节', () => {
    const state = build({
      subjects: [{ id: 'math', name: '数学', bookId: BOOK.id }],
      weekly: [{ weekday: weekdayOf(TOMORROW), slot: 2, subject: 'math' }],
      pace: [{ subject: 'math', perLesson: 2 }],
      progress: [{ subject: 'math', section: '1.1 集合的概念' }],
    })
    const result = plan(state, { textbook: fakeBook(), today: TODAY, minutes: 25 })
    expect(result.upcoming[0]?.sections).toEqual(['1.2 集合间的关系', '1.3 集合的运算'])
    expect(result.upcoming[0]?.to).toBe('1.3 集合的运算')
    expect(result.prep[0]?.section).toBe('1.2 集合间的关系')
  })

  it('进度到最后一节时说明推不动', () => {
    const state = build({
      subjects: [{ id: 'math', name: '数学', bookId: BOOK.id }],
      weekly: [{ weekday: weekdayOf(TOMORROW), slot: 2, subject: 'math' }],
      progress: [{ subject: 'math', section: '1.3 集合的运算' }],
    })
    const result = plan(state, { textbook: fakeBook(), today: TODAY, minutes: 25 })
    expect(result.upcoming[0]?.gap).toContain('已经是最后一节')
  })

  it('教材没绑定、教材库不可用时给提示而不是崩', () => {
    const unbound = build({
      subjects: [{ id: 'math', name: '数学' }],
      weekly: [{ weekday: weekdayOf(TOMORROW), slot: 2, subject: 'math' }],
    })
    const noBook = plan(unbound, { textbook: fakeBook(), today: TODAY, minutes: 25 })
    expect(noBook.upcoming[0]?.gap).toContain('bookId')
    expect(noBook.prep).toEqual([])

    const noCorpus = plan(tomorrowLesson, { today: TODAY, minutes: 25 })
    expect(noCorpus.upcoming[0]?.gap).toContain('教材库不可用')
  })
})

describe('例外日', () => {
  it('holiday 整天不排课，顺延到下一个同星期的课', () => {
    const state = applyPatch(tomorrowLesson, {
      addExceptions: [{ date: TOMORROW, kind: 'holiday', note: '运动会' }],
    }, TODAY)
    const next = nextLessonDay(state, TODAY)
    expect(next?.date).toBe(addDays(TOMORROW, 7))
    const result = plan(state, { textbook: fakeBook(), today: TODAY, minutes: 25 })
    expect(result.upcoming[0]?.date).toBe(addDays(TOMORROW, 7))
  })

  it('只影响某个科目的例外只挡那一科', () => {
    const state = build({
      subjects: [{ id: 'math', name: '数学' }, { id: 'chem', name: '化学' }],
      weekly: [
        { weekday: weekdayOf(TOMORROW), slot: 1, subject: 'math' },
        { weekday: weekdayOf(TOMORROW), slot: 2, subject: 'chem' },
      ],
      addExceptions: [{ date: TOMORROW, kind: 'exam', subject: 'math' }],
    })
    const next = nextLessonDay(state, TODAY)
    expect(next?.date).toBe(TOMORROW)
    expect(next?.lessons.map(lesson => lesson.subject)).toEqual(['chem'])
  })

  it('两周内都没有课时说清并照常给复习', () => {
    const state = build({
      subjects: [{ id: 'math', name: '数学' }],
      weekly: [{ weekday: 7, slot: 1, subject: 'math' }],
    })
    let blocked = state
    for (let offset = 0; offset <= 14; offset += 1) {
      blocked = applyPatch(blocked, { addExceptions: [{ date: addDays(TODAY, offset), kind: 'holiday' }] }, TODAY)
    }
    const result = plan(blocked, { bank: fakeBank([record({ id: 'due', review: { nextAt: TODAY } })]), today: TODAY, minutes: 25 })
    expect(result.upcoming).toEqual([])
    expect(result.notes.some(note => note.includes('没有能上的课'))).toBe(true)
    expect(result.review).toHaveLength(1)
  })
})

describe('历史遗留', () => {
  it('超过 14 天没动的算遗留，第 14 天还不算', () => {
    const bank = fakeBank([
      record({ id: 'stale', updatedAt: addDays(TODAY, -(STALE_DAYS + 1)) + 'T10:00:00.000Z' }),
      record({ id: 'edge', updatedAt: addDays(TODAY, -STALE_DAYS) + 'T10:00:00.000Z' }),
    ])
    const result = plan(emptySchedule(), { bank, today: TODAY, minutes: 25 })
    expect(result.leftover.map(item => item.id)).toEqual(['stale'])
    expect(result.leftover[0]?.reason).toBe('stale')
    expect(result.leftover[0]?.why).toContain('15 天')
  })

  it('同一道错两次算遗留，错一次不算', () => {
    const bank = fakeBank([
      record({ id: 'twice', work: { attempts: [{ verdict: 'wrong' }, { verdict: 'partial' }, { verdict: 'wrong' }] } }),
      record({ id: 'once', work: { attempts: [{ verdict: 'wrong' }] } }),
    ])
    const result = plan(emptySchedule(), { bank, today: TODAY, minutes: 25 })
    expect(result.leftover.map(item => item.id)).toEqual(['twice'])
    expect(result.leftover[0]?.reason).toBe('wrong-twice')
  })

  it('没有时间戳的题不会因为没时间戳被算成遗留', () => {
    const bank = fakeBank([record({ id: 'no-stamp' })])
    const result = plan(emptySchedule(), { bank, today: TODAY, minutes: 25 })
    expect(result.leftover).toEqual([])
  })
})

describe('renderPlan', () => {
  it('四块都在，顺序固定', () => {
    const result = plan(tomorrowLesson, {
      bank: fakeBank([record({ id: 'due', review: { nextAt: TODAY } })]),
      textbook: fakeBook(),
      today: TODAY,
      minutes: 25,
    })
    const text = renderPlan(result)
    const order = ['一、下一次课讲什么', '二、今天预习', '三、今天复习', '四、历史遗留']
    const indexes = order.map(heading => text.indexOf(heading))
    expect(indexes.every(index => index > 0)).toBe(true)
    expect([...indexes].sort((left, right) => left - right)).toEqual(indexes)
    expect(text).toContain('【2026-11-02 周一】')
    expect(text).toContain('《人教A版数学必修一》')
  })
})
