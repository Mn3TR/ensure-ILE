import { describe, expect, it } from 'vitest'
import {
  HANDOFF_IMAGE_LIMIT,
  HANDOFF_SUMMARY_MAX_CHARS,
  boundSummary,
  carriedImages,
  handoffContent,
  handoffNotice,
  replacementRange,
} from '../src/handoff.ts'
import type { ContentBlock, ImageBlock } from '@deepseek-ai/dsh-llm'

/** One image content block naming a fake attachment. */
function image(attachmentId: string, offloaded = false): ImageBlock {
  return {
    type: 'image',
    attachment: { attachmentId, mediaType: 'image/png', bytes: 12, width: 4, height: 3 },
    ...(offloaded ? { offloaded: true as const } : {}),
  }
}

/** The text block of a user message's content. */
function textOf(content: readonly ContentBlock[]): string {
  const block = content[0]
  if (block === undefined || block.type !== 'text') throw new Error('expected text first')
  return block.text
}

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

describe('carriedImages', () => {
  it('keeps every picture, oldest first', () => {
    const blocks: ContentBlock[] = [{ type: 'text', text: '这题' }, image('a'), image('b')]
    expect(carriedImages(blocks).map(block => block.attachment.attachmentId)).toEqual(['a', 'b'])
  })

  it('takes one slot per attachment, at its newest occurrence', () => {
    const blocks: ContentBlock[] = [image('a'), image('b'), image('a')]
    expect(carriedImages(blocks).map(block => block.attachment.attachmentId)).toEqual(['b', 'a'])
  })

  it('keeps the newest when over the limit', () => {
    const blocks: ContentBlock[] = ['a', 'b', 'c', 'd', 'e'].map(id => image(id))
    const kept = carriedImages(blocks)
    expect(kept).toHaveLength(HANDOFF_IMAGE_LIMIT)
    expect(kept.map(block => block.attachment.attachmentId)).toEqual(['b', 'c', 'd', 'e'])
  })

  it('leaves offloaded pictures behind', () => {
    const blocks: ContentBlock[] = [image('a'), image('b', true)]
    expect(carriedImages(blocks).map(block => block.attachment.attachmentId)).toEqual(['a'])
  })

  it('is empty for a text-only range', () => {
    expect(carriedImages([{ type: 'text', text: '只看字' }])).toEqual([])
  })
})

describe('handoffContent', () => {
  it('puts the pictures after the notice text in the same message', () => {
    const images = [image('a'), image('b')]
    const content = handoffContent({ from: '引导模式', to: '独立做题', summary: '卡在第二问', images })
    expect(content).toHaveLength(3)
    expect(textOf(content)).toContain('原来那 2 张图还在下面')
    expect(content.slice(1)).toEqual(images)
  })

  it('leaves the message text-only when the range had no picture', () => {
    const content = handoffContent({ from: '引导模式', to: '独立做题', summary: '做完了' })
    expect(content).toHaveLength(1)
    expect(textOf(content)).toContain('只留下这段摘要')
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
