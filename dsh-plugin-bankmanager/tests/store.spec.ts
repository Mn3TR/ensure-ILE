import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BankError,
  createProblem,
  isReviewDue,
  listProblems,
  makeProblemId,
  parseRecord,
  problemPath,
  readProblem,
  reviewDueAt,
  slugSubject,
  pendingHandoffs,
  resumeView,
  summarizeProblem,
  summarizeStats,
  updateProblem,
} from '../src/store.ts'

const roots: string[] = []
function bank(): string {
  const root = mkdtempSync(join(tmpdir(), 'ensure-ile-bank-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('slugSubject', () => {
  it('keeps ascii words', () => {
    expect(slugSubject('Math')).toBe('math')
    expect(slugSubject('Physical Chemistry')).toBe('physical-chemistry')
  })
  it('collapses punctuation and non-ascii runs', () => {
    expect(slugSubject('数学')).toBe('other')
    expect(slugSubject('math/函数')).toBe('math')
  })
  it('falls back to other', () => {
    expect(slugSubject('   ')).toBe('other')
  })
})

describe('ids', () => {
  it('formats date and suffix', () => {
    const id = makeProblemId('physics', new Date(2026, 9, 24, 12), 'abcdef')
    expect(id).toBe('20261024-physics-abcdef')
  })
  it('rejects path traversal', () => {
    expect(() => problemPath('C:/bank', '../evil')).toThrow(BankError)
  })
})

describe('create and read', () => {
  it('writes one json file with defaults', async () => {
    const dir = bank()
    const record = await createProblem(dir, { statement: '已知 f(x)=x^2，求 f\'(2)', subject: 'math', tags: ['导数'], now: new Date('2026-10-24T12:00:00Z'), suffix: 'aaaaaa' })
    expect(record.id).toBe('20261024-math-aaaaaa')
    expect(record.status).toBe('new')
    const file = readFileSync(problemPath(dir, record.id), 'utf8')
    expect(JSON.parse(file).statement).toContain('f(x)')
    expect(readdirSync(dir)).toEqual([record.id + '.json'])
  })
  it('explains a missing problem', () => {
    const dir = bank()
    expect(() => readProblem(dir, '20261024-math-bbbbbb')).toThrow(/没有这道题/u)
  })
  it('rejects an empty statement', async () => {
    await expect(createProblem(bank(), { statement: '  ', subject: 'math' })).rejects.toThrow(BankError)
  })
})

describe('listing', () => {
  it('skips corrupt files and sorts by creation', async () => {
    const dir = bank()
    const first = await createProblem(dir, { statement: 'one', subject: 'math', now: new Date('2026-10-22T00:00:00Z'), suffix: '111111' })
    const second = await createProblem(dir, { statement: 'two', subject: 'arts', now: new Date('2026-10-23T00:00:00Z'), suffix: '222222' })
    writeFileSync(join(dir, '20261024-math-broken.json'), '{not json')
    const listing = listProblems(dir)
    expect(listing.records.map(record => record.id)).toEqual([first.id, second.id])
    expect(listing.skipped).toHaveLength(1)
  })
})

describe('update', () => {
  it('applies explicit fields, appends attempts and history', async () => {
    const dir = bank()
    const record = await createProblem(dir, { statement: 'one', subject: 'math', now: new Date('2026-10-24T10:00:00Z'), suffix: '333333' })
    const updated = await updateProblem(dir, record.id, {
      status: 'guide',
      guideOutcome: 'stuck',
      whereStuck: '第二问换元',
      insight: '先看重复结构',
      workAttempt: { answer: '试了换元', verdict: 'partial' },
      patch: { tags: ['函数'] },
      now: new Date('2026-10-24T11:00:00Z'),
    })
    expect(updated.status).toBe('guide')
    expect(updated.guide.sessions).toHaveLength(1)
    expect(updated.guide.sessions[0]?.outcome).toBe('stuck')
    expect(updated.guide.sessions[0]?.whereStuck).toBe('第二问换元')
    expect(updated.guide.insight).toBe('先看重复结构')
    expect(updated.work.attempts).toHaveLength(1)
    expect(updated.work.attempts[0]?.source).toBe('text')
    expect(updated.tags).toEqual(['函数'])
    expect(updated.updatedAt).toBe('2026-10-24T11:00:00.000Z')
    expect(updated.history.length).toBeGreaterThan(1)
  })
  it('refuses unknown status', async () => {
    const dir = bank()
    const record = await createProblem(dir, { statement: 'one', subject: 'math', suffix: '444444' })
    await expect(updateProblem(dir, record.id, { status: 'solved' })).rejects.toThrow(BankError)
  })
  it('keeps the record valid after a free patch', async () => {
    const dir = bank()
    const record = await createProblem(dir, { statement: 'one', subject: 'math', suffix: '555555' })
    await updateProblem(dir, record.id, { patch: { custom: { at: 'x' } } })
    expect(parseRecord(JSON.parse(readFileSync(problemPath(dir, record.id), 'utf8'))).id).toBe(record.id)
  })
})

describe('stats', () => {
  it('counts statuses and reports the stalest', async () => {
    const dir = bank()
    await createProblem(dir, { statement: 'one', subject: 'math', now: new Date('2026-10-01T00:00:00Z'), suffix: '666666' })
    const second = await createProblem(dir, { statement: 'two', subject: 'math', now: new Date('2026-10-02T00:00:00Z'), suffix: '777777' })
    await updateProblem(dir, second.id, { status: 'review' })
    const stats = summarizeStats(listProblems(dir).records)
    expect(stats.total).toBe(2)
    expect(stats.byStatus).toMatchObject({ new: 1, review: 1 })
    expect(stats.stalest[0]?.id).toContain('666666')
  })
})

describe('answer optimization', () => {
  it('writes the teacher trajectory, one step twice, then closes the pairing', async () => {
    const dir = bank()
    const record = await createProblem(dir, { statement: 'one', subject: 'math', suffix: '888888' })
    await updateProblem(dir, record.id, {
      hrl: {
        input: { at: '2026-10-25T00:00:00.000Z', from: 'work', answer: '我的解法' },
        teacher: {
          writtenAt: '2026-10-25T00:01:00.000Z',
          answer: 'x=2',
          steps: [{ index: 1, body: '移项', reason: '保持等价' }],
        },
      },
    })
    await updateProblem(dir, record.id, {
      hrl: { step: { index: 1, studentQuote: '先移项', teacherStep: 1, match: 'partial' } },
    })
    const chosen = await updateProblem(dir, record.id, {
      hrl: {
        step: { index: 1, studentQuote: '先移项', teacherStep: 1, match: 'partial', chosen: 'merged', mergedText: '先移项再合并' },
      },
    })
    expect(chosen.hrl?.pairings[0]?.steps).toHaveLength(1)
    expect(chosen.hrl?.pairings[0]?.steps[0]?.mergedText).toBe('先移项再合并')

    const closed = await updateProblem(dir, record.id, { hrl: { result: '先移项再合并' } })
    expect(closed.hrl?.teacher?.steps).toHaveLength(1)
    expect(closed.hrl?.pairings).toHaveLength(1)
    expect(closed.hrl?.pairings[0]?.result).toBe('先移项再合并')
    expect(closed.hrl?.input?.from).toBe('work')
  })

  it('refuses a result without an open pairing', async () => {
    const dir = bank()
    const record = await createProblem(dir, { statement: 'one', subject: 'math', suffix: 'aaaaab' })
    await expect(updateProblem(dir, record.id, { hrl: { result: 'x' } })).rejects.toThrow(BankError)
  })
})

describe('handoff', () => {
  it('writes, consumes, releases and surfaces in list and stats', async () => {
    const dir = bank()
    const record = await createProblem(dir, { statement: 'one', subject: 'math', suffix: 'bbbbbc' })
    const written = await updateProblem(dir, record.id, {
      handoff: { from: 'work', to: 'guide', why: '讲不清', state: '第二步', detail: { nextStep: '从提问开始' } },
    })
    expect(written.handoff?.id).toMatch(/^hlt-/u)
    expect(summarizeProblem(written)).toContain('-> guide 待接')
    expect(summarizeStats([written]).pendingHandoffs).toBe(1)

    const consumed = await updateProblem(dir, record.id, { handoffConsume: 'session-1' })
    expect(consumed.handoff?.consumerSessionId).toBe('session-1')
    expect(consumed.handoff?.consumedAt).toBeDefined()
    expect(summarizeStats([consumed]).pendingHandoffs).toBe(0)
    expect(summarizeProblem(consumed)).not.toContain('待接')

    const released = await updateProblem(dir, record.id, { handoffConsume: '' })
    expect(released.handoff?.consumedAt).toBeUndefined()
    expect(summarizeStats([released]).pendingHandoffs).toBe(1)
  })

  it('replaces an unconsumed handoff and records the drop', async () => {
    const dir = bank()
    const record = await createProblem(dir, { statement: 'one', subject: 'math', suffix: 'cccccd' })
    await updateProblem(dir, record.id, { handoff: { from: 'work', to: 'guide', why: 'a', state: 'b' } })
    const second = await updateProblem(dir, record.id, { handoff: { from: 'guide', to: 'hrl', why: 'c', state: 'd' } })
    expect(second.handoff?.to).toBe('hrl')
    expect(second.history.some(entry => entry.event.startsWith('handoff dropped'))).toBe(true)
  })

  it('keeps a v1 file unreadable instead of half-migrating it', () => {
    expect(() => parseRecord({ schema: 1, id: 'x' })).toThrow(/schema 必须是 2/u)
  })
})

describe('review ladder', () => {
  it('schedules the first sitting when a problem enters review', async () => {
    const dir = bank()
    const record = await createProblem(dir, { statement: 'one', subject: 'math', now: new Date('2026-10-25T00:00:00Z'), suffix: 'ddddde' })
    const updated = await updateProblem(dir, record.id, { status: 'review', now: new Date('2026-10-25T00:00:00Z') })
    expect(updated.review.interval).toBe(1)
    expect(updated.review.nextAt).toBe('2026-10-26T00:00:00.000Z')
  })

  it('walks up the ladder and reaches mastered on the last rung', async () => {
    const dir = bank()
    const record = await createProblem(dir, { statement: 'one', subject: 'math', suffix: 'eeeeef' })
    await updateProblem(dir, record.id, { status: 'review', now: new Date('2026-10-25T00:00:00Z') })
    const rungs: number[] = []
    let current = record.id
    for (let i = 0; i < 7; i += 1) {
      const next = await updateProblem(dir, current, { reviewPassed: true, now: new Date('2026-10-25T00:00:00Z') })
      rungs.push(next.review.interval as number)
      current = next.id
    }
    expect(rungs).toEqual([3, 7, 14, 30, 60, 120, 120])
    const last = await updateProblem(dir, record.id, {})
    expect(last.status).toBe('mastered')
  })

  it('resets to the first rung on a failed review', async () => {
    const dir = bank()
    const record = await createProblem(dir, { statement: 'one', subject: 'math', suffix: 'ffffff' })
    await updateProblem(dir, record.id, { status: 'review', now: new Date('2026-10-25T00:00:00Z') })
    await updateProblem(dir, record.id, { reviewPassed: true, now: new Date('2026-10-25T00:00:00Z') })
    const failed = await updateProblem(dir, record.id, { reviewPassed: false, now: new Date('2026-10-25T00:00:00Z') })
    expect(failed.review.interval).toBe(1)
    expect(failed.review.count).toBe(0)
    expect(failed.status).toBe('review')
  })
})

describe('learner signals', () => {
  it('writes affect and effectiveHint onto the open guide session', async () => {
    const dir = bank()
    const record = await createProblem(dir, { statement: 'one', subject: 'math', suffix: 'aaaab1' })
    await updateProblem(dir, record.id, { status: 'guide', affect: 'frustrated', effectiveHint: 'feature' })
    const state = await updateProblem(dir, record.id, { guideOutcome: 'stuck' })
    expect(state.guide.sessions[0]?.affect).toBe('frustrated')
    expect(state.guide.sessions[0]?.effectiveHint).toBe('feature')
  })
  it('refuses an unknown affect', async () => {
    const dir = bank()
    const record = await createProblem(dir, { statement: 'one', subject: 'math', suffix: 'bbbcc2' })
    await expect(updateProblem(dir, record.id, { affect: 'angry' })).rejects.toThrow(BankError)
  })
})
describe('resume', () => {
  it('lists only unconsumed handoffs, newest first', async () => {
    const dir = bank()
    const first = await createProblem(dir, { statement: 'one', subject: 'math', now: new Date('2026-10-25T00:00:00Z'), suffix: 'aa11bb' })
    const second = await createProblem(dir, { statement: 'two', subject: 'math', now: new Date('2026-10-25T00:01:00Z'), suffix: 'cc22dd' })
    await updateProblem(dir, first.id, { handoff: { from: 'work', to: 'guide', why: '讲不清', state: '第二步' }, now: new Date('2026-10-25T00:02:00Z') })
    await updateProblem(dir, second.id, { handoff: { from: 'guide', to: 'hrl', why: '改', state: '第三步' }, now: new Date('2026-10-25T00:03:00Z') })
    const pending = pendingHandoffs(listProblems(dir).records)
    expect(pending.map(entry => entry.id)).toEqual([second.id, first.id])
    await updateProblem(dir, first.id, { handoffConsume: 'session-9' })
    expect(pendingHandoffs(listProblems(dir).records).map(entry => entry.id)).toEqual([second.id])
  })

  it('builds a resume view with statement, handoff, insight and last attempt', async () => {
    const dir = bank()
    const record = await createProblem(dir, { statement: 'first', subject: 'math', suffix: 'ee33ff' })
    await updateProblem(dir, record.id, {
      status: 'guide',
      insight: '先看重复结构',
      workAttempt: { answer: '我写了一半', verdict: 'partial' },
      handoff: { from: 'work', to: 'guide', why: '讲不清', state: '第二步' },
    })
    const view = resumeView(readProblem(dir, record.id))
    expect(view.statement).toBe('first')
    expect(view.insight).toBe('先看重复结构')
    expect(view.lastAttempt?.answer).toBe('我写了一半')
    expect(view.handoff?.to).toBe('guide')
  })
})
describe('review due window', () => {
  it('只有排过期、状态还活着、时间已到的题才算到期', () => {
    const base = {
      schema: 2 as const,
      id: 'x',
      subject: 'math',
      tags: [],
      statement: 's',
      attachments: [],
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      guide: { sessions: [] },
      work: { attempts: [] },
      history: [],
    }
    const now = new Date('2026-10-10T12:00:00.000Z')
    const due = (record: Parameters<typeof isReviewDue>[0]) => isReviewDue(record, now)
    expect(due({ ...base, status: 'review', review: { count: 1, history: [], nextAt: '2026-10-10T00:00:00.000Z' } })).toBe(true)
    expect(due({ ...base, status: 'review', review: { count: 1, history: [], nextAt: '2026-10-20T00:00:00.000Z' } })).toBe(false)
    expect(due({ ...base, status: 'review', review: { count: 1, history: [] } })).toBe(false)
    expect(due({ ...base, status: 'mastered', review: { count: 9, history: [], nextAt: '2026-01-01T00:00:00.000Z' } })).toBe(false)
    expect(due({ ...base, status: 'parked', review: { count: 1, history: [], nextAt: '2026-01-01T00:00:00.000Z' } })).toBe(false)
    expect(reviewDueAt({ ...base, status: 'review', review: { count: 1, history: [], nextAt: '不是日期' } })).toBeUndefined()
  })
})
