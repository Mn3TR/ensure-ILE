import { useState } from 'react'
import { readHandoffView, resumePrompt, type HandoffView } from './handoff-model.ts'

/** 工具结果块里我们认得的形状；卡片只读文本，不认图片或结构化块。 */
interface TextBlock { readonly type: string; readonly text?: string }

/** 卡片收到的工具调用阶段数据；结构来自 `tool.call.toolview` 的 owner props。 */
export interface HandoffCardProps {
  readonly phase: 'preparing' | 'start' | 'result'
  readonly block?: unknown
}

function textOf(block: unknown): string | undefined {
  if (typeof block !== 'object' || block === null) return undefined
  const content = (block as { content?: unknown }).content
  if (!Array.isArray(content)) return undefined
  const parts: string[] = []
  for (const item of content as unknown[]) {
    if (typeof item !== 'object' || item === null) continue
    const { type, text } = item as TextBlock
    if (type === 'text' && typeof text === 'string') parts.push(text)
  }
  return parts.length === 0 ? undefined : parts.join('\n')
}

/** 交接卡片：在聊天里替模型把「上次停在哪」摊开，学生一眼看见就能接着做。 */
export function HandoffCard({ phase, block }: HandoffCardProps) {
  if (phase !== 'result') return null
  const text = textOf(block)
  const view = text === undefined ? undefined : readHandoffView(text)
  if (view === undefined) return null
  return <HandoffBody view={view} />
}

function HandoffBody({ view }: { readonly view: HandoffView }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    const text = resumePrompt(view)
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 2400)
    }).catch(() => { setCopied(false) })
  }
  return <div className="ile-handoff" data-ile-handoff={view.id}>
    <div className="ile-handoff__kicker">
      接着上次的题 · {view.id}{view.from === undefined || view.to === undefined ? null : ` · ${view.from} → ${view.to}`}
    </div>
    <div className="ile-handoff__statement">{view.statement}</div>
    {view.lastWords === undefined ? null : <p className="ile-handoff__quote">
      <span className="ile-handoff__label">你上次停在</span>{view.lastWords}
    </p>}
    {view.nextStep === undefined ? null : <p className="ile-handoff__next">
      <span className="ile-handoff__label">下一步</span>{view.nextStep}
    </p>}
    {view.nextStep === undefined && view.blocker !== undefined ? <p className="ile-handoff__next">
      <span className="ile-handoff__label">卡在</span>{view.blocker}
    </p> : null}
    <div className="ile-handoff__row">
      <button type="button" className="ile-handoff__button" onClick={copy}>
        {copied ? '已复制' : '接着做'}
      </button>
      <span className="ile-handoff__hint">
        {copied ? '开个新会话，选「引导模式」，把这句话发出去。' : '复制这句话，新会话里直接发。'}
      </span>
    </div>
  </div>
}
