/**
 * 交接卡片的数据模型：只认 `bank_resume` 的结果 JSON，不 import 题库代码。
 *
 * 客户端与宿主插件是两个构建面（宿主是 Node，这里是浏览器），跨面只靠工具结果
 * 这一份持久化数据；模型改字段时这里静默退化成普通文本行，不会抛。
 */

/** 卡片要展示的一屏信息；缺哪块就不画哪块。 */
export interface HandoffView {
  /** 题目 id，同时是「接着做」那句提示里的关键词。 */
  id: string
  /** 题干原文，按课本排版展示。 */
  statement: string
  status: string | undefined
  /** 学生上次说的最后一句话（原话，不改写）。 */
  lastWords: string | undefined
  /** 卡点。 */
  blocker: string | undefined
  /** 下一步从哪接。 */
  nextStep: string | undefined
  /** 从哪个模式交出来的。 */
  from: string | undefined
  /** 交给哪个模式。 */
  to: string | undefined
  /** 为什么交出来。 */
  why: string | undefined
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** 解析 `bank_resume` 的结果文本；不是那次调用的 JSON 形状时返回 undefined。 */
export function readHandoffView(text: string): HandoffView | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  const root = record(parsed)
  if (root === undefined) return undefined
  const id = asText(root.id)
  const statement = asText(root.statement)
  if (id === undefined || statement === undefined) return undefined
  const handoff = record(root.handoff)
  const detail = handoff === undefined ? undefined : record(handoff.detail)
  return {
    id,
    statement,
    status: asText(root.status),
    lastWords: detail === undefined ? undefined : asText(detail.lastWords),
    blocker: detail === undefined ? undefined : asText(detail.blocker),
    nextStep: detail === undefined ? undefined : asText(detail.nextStep),
    from: handoff === undefined ? undefined : asText(handoff.from),
    to: handoff === undefined ? undefined : asText(handoff.to),
    why: handoff === undefined ? undefined : asText(handoff.why),
  }
}

/** 「接着做」按钮复制给学生的那句话：新会话开场直接发给模型，不用重讲题干。 */
export function resumePrompt(view: HandoffView): string {
  return `接着上次那道题：${view.id}`
}

/** 学生这次真正发出去的那句话；带状态，模型一眼看见这题到哪一步。 */
export function resumeSentence(id: string, status?: string): string {
  return status === undefined || status.trim() === ''
    ? `接着上次那道题：${id}`
    : `接着上次那道题：${id}（${status}）`
}

/** 卡片「接着做」塞进新会话的那句话。 */
export function resumeText(view: HandoffView): string {
  return resumeSentence(view.id, view.status)
}

/** 交接包里的模式名 → 预设 id。认模型写的中文显示名；不认识的交回 Host 默认。 */
export function presetForMode(mode: string | undefined): string | undefined {
  if (mode === undefined) return undefined
  const key = mode.trim().toLowerCase()
  if (key === 'guide' || key === '引导模式') return 'guide'
  if (key === 'work' || key === '独立做题') return 'work'
  if (key === 'hrl' || key === '答案优化') return 'hrl'
  if (key === 'setup' || key === '开学') return 'setup'
  return undefined
}

/** `/bank/api` 的待接行，只留首页入口要用的字段。 */
export interface PendingHandoff {
  readonly id: string
  readonly statement: string
  readonly status: string | undefined
  readonly to: string | undefined
}

/**
 * 解析 `handoff.pending` 的返回值；形状不对的行直接丢，不抛。
 * @param value - route 返回的 value（数组）。
 * @returns 能画出来的待接行。
 */
export function readPendingHandoffs(value: unknown): PendingHandoff[] {
  if (!Array.isArray(value)) return []
  const rows: PendingHandoff[] = []
  for (const item of value) {
    const root = record(item)
    if (root === undefined) continue
    const id = asText(root.id)
    const statement = asText(root.statement)
    if (id === undefined || statement === undefined) continue
    const handoff = record(root.handoff)
    rows.push({
      id,
      statement,
      status: asText(root.status),
      to: handoff === undefined ? undefined : asText(handoff.to),
    })
  }
  return rows
}
