/**
 * The pure half of a switch: the notice that replaces folded history and the
 * surface range that replacement covers. Kept free of cordis so the rules are
 * unit-testable.
 *
 * @module dsh-plugin-coreset/handoff
 */

import type { ContentBlock, ImageBlock } from '@deepseek-ai/dsh-llm'
import type { SessionSeq } from '@deepseek-ai/dsh-session'

/** Most pictures one handoff notice carries into the next mode. */
export const HANDOFF_IMAGE_LIMIT = 4

/** Longest summary the notice's bounded form keeps, matching upstream notices. */
export const HANDOFF_SUMMARY_MAX_CHARS = 120

/** Flatten and bound a summary the way context notices do. */
export function boundSummary(summary: string): string {
  const flat = summary.replace(/\s+/g, ' ').trim()
  return flat.length <= HANDOFF_SUMMARY_MAX_CHARS
    ? flat
    : `${flat.slice(0, HANDOFF_SUMMARY_MAX_CHARS - 1)}…`
}

/** Input of {@link handoffNotice}. */
export interface HandoffNoticeInput {
  /** Display name of the mode being left. */
  readonly from: string
  /** Display name of the mode being entered. */
  readonly to: string
  /** The model's handoff summary; may be empty when it wrote none. */
  readonly summary: string
  /** Pictures that follow the notice text in the same message. */
  readonly imageCount?: number
}

/**
 * The one user-role message that survives a switch. It is both the model's
 * memory of the folded conversation and the student's marker that the switch
 * happened.
 */
export function handoffNotice({ from, to, summary, imageCount = 0 }: HandoffNoticeInput): string {
  const body = summary.trim()
  const kept = imageCount > 0
    ? `之前那段对话收成了这段摘要，原来那 ${imageCount} 张图还在下面：`
    : '之前那段对话不在这条上下文里了，只留下这段摘要：'
  return [
    `【交接】从「${from}」换到「${to}」。`,
    kept,
    '',
    body === '' ? '（没留摘要。）' : body,
    '',
    '从这里接着走。',
  ].join('\n')
}

/**
 * The pictures a folded range keeps.
 *
 * Newest occurrences win, and one attachment takes one slot however often the
 * student pasted it. Offloaded pictures stay out: the route already refused
 * their bytes once, so re-sending them would only spend the same budget again.
 * @param blocks - content of the messages being folded, in model order.
 * @param limit - most pictures to carry.
 */
export function carriedImages(
  blocks: readonly ContentBlock[],
  limit: number = HANDOFF_IMAGE_LIMIT,
): ImageBlock[] {
  const kept: ImageBlock[] = []
  const seen = new Set<string>()
  for (let index = blocks.length - 1; index >= 0 && kept.length < limit; index -= 1) {
    const block = blocks[index]
    if (block === undefined || block.type !== 'image' || block.offloaded === true) continue
    if (seen.has(block.attachment.attachmentId)) continue
    seen.add(block.attachment.attachmentId)
    kept.unshift(block)
  }
  return kept
}

/** Input of {@link handoffContent}. */
export interface HandoffContentInput extends HandoffNoticeInput {
  /** Pictures to keep beside the notice; the notice text counts them. */
  readonly images?: readonly ImageBlock[]
}

/**
 * The one message a switch leaves behind: the notice text, then the pictures
 * the folded history was about. The bytes stay in the attachment store — the
 * blocks are references, so a switch re-points at the same picture instead of
 * copying it.
 */
export function handoffContent({ images = [], ...notice }: HandoffContentInput): ContentBlock[] {
  return [
    { type: 'text', text: handoffNotice({ ...notice, imageCount: images.length }) },
    ...images,
  ]
}

/** The surface region one switch replaces. */
export interface ReplaceRange {
  readonly startSeq: SessionSeq
  readonly endSeq: SessionSeq
  /** Every shadowed surface node; the session rejects a replace that omits one. */
  readonly sourceEventSeqs: SessionSeq[]
}

/**
 * Every surface node except the system head. Node 0 holds the system prompt and
 * may only be rewritten by a `system/message` over exactly that node, so a
 * switch starts at node 1 and the runtime's own normalization replaces the head
 * with the new mode's text.
 *
 * @returns null when there is nothing after the head to replace.
 */
export function replacementRange(nodes: readonly SessionSeq[]): ReplaceRange | null {
  const shadowed = nodes.slice(1)
  const first = shadowed[0]
  const last = shadowed[shadowed.length - 1]
  if (first === undefined || last === undefined) return null
  return { startSeq: first, endSeq: last, sourceEventSeqs: [...shadowed] }
}
