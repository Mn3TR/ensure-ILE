/**
 * The pure half of a switch: the notice that replaces folded history and the
 * surface range that replacement covers. Kept free of cordis so the rules are
 * unit-testable.
 *
 * @module dsh-plugin-coreset/handoff
 */

import type { SessionSeq } from '@deepseek-ai/dsh-session'

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
}

/**
 * The one user-role message that survives a switch. It is both the model's
 * memory of the folded conversation and the student's marker that the switch
 * happened.
 */
export function handoffNotice({ from, to, summary }: HandoffNoticeInput): string {
  const body = summary.trim()
  return [
    `【交接】从「${from}」换到「${to}」。`,
    '之前那段对话不在这条上下文里了，只留下这段摘要：',
    '',
    body === '' ? '（没留摘要。）' : body,
    '',
    '从这里接着走。',
  ].join('\n')
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
