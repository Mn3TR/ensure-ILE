import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BankError,
  createProblem,
  listProblems,
  makeProblemId,
  parseRecord,
  problemPath,
  readProblem,
  slugSubject,
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
      attempt: { mode: 'guide', answer: '试了换元', verdict: 'partial' },
      patch: { tags: ['函数'] },
      now: new Date('2026-10-24T11:00:00Z'),
    })
    expect(updated.status).toBe('guide')
    expect(updated.guide.sessions).toHaveLength(1)
    expect(updated.guide.sessions[0]?.outcome).toBe('stuck')
    expect(updated.guide.sessions[0]?.whereStuck).toBe('第二问换元')
    expect(updated.guide.insight).toBe('先看重复结构')
    expect(updated.attempts).toHaveLength(1)
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
