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
