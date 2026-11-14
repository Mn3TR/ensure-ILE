import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProblem, problemPath, readProblem, updateProblem } from '../src/store.ts'

const roots: string[] = []
async function problem() {
  const directory = mkdtempSync(join(tmpdir(), 'ile-learning-'))
  roots.push(directory)
  const record = await createProblem(directory, { statement: 'x²=1，求解集', subject: 'math' })
  await updateProblem(directory, record.id, { status: 'review' })
  return { directory, id: record.id }
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const recall = { context: 'delayed-recall', support: 'none', outcome: 'solved', answer: 'x=1 或 x=-1' } as const

describe('learning evidence', () => {
  it('keeps guided completion distinct from subsequent independent recall after reading from disk', async () => {
    const { directory, id } = await problem()
    await updateProblem(directory, id, { learningEvidence: { ...recall, context: 'guided', support: 'example' } })
    expect(readProblem(directory, id).review.interval).toBe(1)
    const now = new Date('2026-11-15T12:00:00Z')
    await updateProblem(directory, id, { learningEvidence: recall, now })
    const saved = readProblem(directory, id)
    expect(saved.learning?.evidence).toEqual([
      expect.objectContaining({ context: 'guided', support: 'example', answer: recall.answer }),
      { ...recall, at: now.toISOString() },
    ])
    expect(saved.review.interval).toBe(3)
    expect(saved.review.count).toBe(1)
  })

  it.each(['attention', 'explanation', 'example'] as const)('does not advance recall completed with %s support', async support => {
    const { directory, id } = await problem()
    await updateProblem(directory, id, { learningEvidence: recall })
    const result = await updateProblem(directory, id, { learningEvidence: { ...recall, support } })
    expect(result.review.interval).toBe(1)
    expect(result.review.count).toBe(0)
  })

  it('records a transfer answer and explicit willingness without advancing the original review', async () => {
    const { directory, id } = await problem()
    const result = await updateProblem(directory, id, { learningEvidence: {
      ...recall, context: 'transfer', answer: 'x=2 或 x=-2', note: '变式：x²=4，求解集', willingness: 'continue',
    } })
    expect(result.learning?.evidence[0]).toMatchObject({ context: 'transfer', willingness: 'continue' })
    expect(result.review.count).toBe(0)
    expect(result.review.interval).toBe(1)
  })

  it('returns a previously mastered problem to review when independent recall fails', async () => {
    const { directory, id } = await problem()
    await updateProblem(directory, id, { status: 'mastered' })
    const result = await updateProblem(directory, id, { learningEvidence: { ...recall, outcome: 'partial', answer: 'x=1' } })
    expect(result.status).toBe('review')
    expect(result.review.interval).toBe(1)
  })

  it.each([
    { reviewPassed: true },
    { reviewPassed: true, learningEvidence: { ...recall, support: 'example' } },
    { reviewPassed: false, learningEvidence: recall },
    { reviewPassed: true, learningEvidence: { ...recall, context: 'transfer' } },
    { learningEvidence: { ...recall, support: 'invented' } },
  ])('rejects unsupported or contradictory evidence atomically: %j', async input => {
    const { directory, id } = await problem()
    const before = readFileSync(problemPath(directory, id), 'utf8')
    await expect(updateProblem(directory, id, input as Parameters<typeof updateProblem>[2])).rejects.toThrow()
    expect(readFileSync(problemPath(directory, id), 'utf8')).toBe(before)
  })

  it('validates learning evidence written through a free patch too', async () => {
    const { directory, id } = await problem()
    const before = readFileSync(problemPath(directory, id), 'utf8')
    await expect(updateProblem(directory, id, { patch: { learning: { evidence: [{ ...recall, at: 'now', outcome: 'invented' }] } } })).rejects.toThrow()
    expect(readFileSync(problemPath(directory, id), 'utf8')).toBe(before)
  })

  it('leaves legacy records readable without inventing independent success', async () => {
    const { directory, id } = await problem()
    expect(readProblem(directory, id).learning).toBeUndefined()
  })

  it('keeps understanding evidence separate from version preference and preserves a confirmed choice', async () => {
    const { directory, id } = await problem()
    await updateProblem(directory, id, { hrl: { step: {
      index: 1, match: 'partial', studentQuote: '我先求导', chosen: 'student', decision: '求导还是配方',
    } } })
    await updateProblem(directory, id, { hrl: { step: {
      index: 1, match: 'partial', understanding: {
        question: '换成不可导的表达式，你会怎么选？', answer: '我还没想清楚', verdict: 'unclear',
      },
    }, preference: 'teacher' } })
    const pairing = readProblem(directory, id).hrl?.pairings[0]
    expect(pairing?.preference).toBe('teacher')
    expect(pairing?.steps[0]).toMatchObject({
      chosen: 'student', studentQuote: '我先求导', decision: '求导还是配方',
      understanding: { answer: '我还没想清楚', verdict: 'unclear' },
    })
  })
})
