import { describe, expect, it } from 'vitest'
import { readHandoffView, resumePrompt } from '../src/client/handoff-model.ts'

const resume = JSON.stringify({
  id: '20261025-math-2d1ed2',
  statement: '设函数 g(x) = x³ − 2（x ∈ R），求 f(x) 的值域。',
  subject: 'math',
  status: 'guide',
  handoff: {
    id: 'hlt-1',
    at: '2026-10-25T00:00:00.000Z',
    from: 'work',
    to: 'guide',
    why: '讲不清过程',
    state: '卡在三次方程',
    detail: { lastWords: '试了 x = 1 是 −2', blocker: '根夹不出来', nextStep: '先夹到两位小数' },
    consumedAt: null,
    consumerSessionId: null,
  },
})

describe('handoff card model', () => {
  it('reads the resume payload into card fields', () => {
    const view = readHandoffView(resume)
    expect(view?.id).toBe('20261025-math-2d1ed2')
    expect(view?.lastWords).toBe('试了 x = 1 是 −2')
    expect(view?.nextStep).toBe('先夹到两位小数')
    expect(view?.from).toBe('work')
  })

  it('ignores payloads that are not a resume', () => {
    expect(readHandoffView('没有待接的交接。')).toBeUndefined()
    expect(readHandoffView('{"id":"x"}')).toBeUndefined()
  })

  it('keeps a problem without a handoff renderable', () => {
    const view = readHandoffView(JSON.stringify({ id: 'a', statement: '求值域' }))
    expect(view?.id).toBe('a')
    expect(view?.nextStep).toBeUndefined()
  })

  it('builds the sentence a new session can send', () => {
    expect(resumePrompt(readHandoffView(resume)!)).toBe('接着上次那道题：20261025-math-2d1ed2')
  })
})
