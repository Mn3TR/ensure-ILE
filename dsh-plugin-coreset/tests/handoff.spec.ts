import { describe, expect, it } from 'vitest'
import {
  HANDOFF_SUMMARY_MAX_CHARS,
  boundSummary,
  handoffNotice,
  replacementRange,
} from '../src/handoff.ts'

describe('boundSummary', () => {
  it('flattens whitespace and trims', () => {
    expect(boundSummary('  在做第二问\n\n卡在\t判别式  ')).toBe('在做第二问 卡在 判别式')
  })

  it('keeps a summary that fits', () => {
    const summary = '题'.repeat(HANDOFF_SUMMARY_MAX_CHARS)
    expect(boundSummary(summary)).toBe(summary)
  })

  it('truncates one character over the limit, ellipsis included', () => {
    const bounded = boundSummary('题'.repeat(HANDOFF_SUMMARY_MAX_CHARS + 10))
    expect(bounded).toHaveLength(HANDOFF_SUMMARY_MAX_CHARS)
    expect(bounded.endsWith('…')).toBe(true)
  })

  it('measures the limit after flattening, not before', () => {
    const spaced = '题\n'.repeat(HANDOFF_SUMMARY_MAX_CHARS)
    expect(boundSummary(spaced)).toHaveLength(HANDOFF_SUMMARY_MAX_CHARS)
  })
})

describe('handoffNotice', () => {
  it('names both modes and keeps the summary', () => {
    const notice = handoffNotice({ from: '引导模式', to: '独立做题', summary: '卡在第二问的判别式' })
    expect(notice).toContain('【交接】从「引导模式」换到「独立做题」。')
    expect(notice).toContain('卡在第二问的判别式')
    expect(notice.trimEnd().endsWith('从这里接着走。')).toBe(true)
    expect(notice).not.toContain('（没留摘要。）')
  })

  it('says so when the model left no summary', () => {
    const notice = handoffNotice({ from: '独立做题', to: '引导模式', summary: '   ' })
    expect(notice).toContain('（没留摘要。）')
  })
})

describe('replacementRange', () => {
  it('covers every node except the system head', () => {
    expect(replacementRange([10, 11, 14, 15])).toEqual({
      startSeq: 11,
      endSeq: 15,
      sourceEventSeqs: [11, 14, 15],
    })
  })

  it('is null when only the head is on the surface', () => {
    expect(replacementRange([10])).toBeNull()
    expect(replacementRange([])).toBeNull()
  })
})
