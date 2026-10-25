import { useState } from 'react'
import { readHandoffView, resumePrompt, type HandoffView } from './handoff-model.ts'

/** 工具结果块里我们认得的形状；卡片只读文本，不认图片或结构化块。 */
interface TextBlock { readonly type: string; readonly text?: string }

/** 「接着做」的三种结局：新会话开好并认领、开好但没认领、开不了。 */
export type ResumeOutcome = 'opened' | 'opened-unconsumed' | 'failed'

/** 卡片收到的工具调用阶段数据；结构来自 `tool.call.toolview` 的 owner props。 */
export interface HandoffCardProps {
  readonly phase: 'preparing' | 'start' | 'result'
  readonly block?: unknown
  /** 注册时注入：开一个新会话，把这题填成学生这次要发的那句话。 */
  readonly resume?: (view: HandoffView) => Promise<ResumeOutcome>
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
export function HandoffCard({ phase, block, resume }: HandoffCardProps) {
  if (phase !== 'result') return null
  const text = textOf(block)
  const view = text === undefined ? undefined : readHandoffView(text)
  if (view === undefined) return null
  return <HandoffBody view={view} resume={resume} />
}

type CardState = 'idle' | 'busy' | ResumeOutcome | 'copied'

const HINT: Record<CardState, string> = {
  idle: '一个按钮：开个新会话，题干直接进输入框。',
  busy: '正在开…',
  opened: '新会话开好了，题干在输入框里，按回车发出去。',
  'opened-unconsumed': '新会话开好了；这题还会出现在「待接」里，等下再点一次也行。',
  failed: '开不了新会话，先复制这句话过去。',
  copied: '已复制，新会话里直接发。',
}

const LABEL: Record<CardState, string> = {
  idle: '接着做',
  busy: '正在开…',
  opened: '已开新会话',
  'opened-unconsumed': '已开新会话',
  failed: '复制这句',
  copied: '已复制',
}

function HandoffBody({ view, resume }: { readonly view: HandoffView; readonly resume?: HandoffCardProps['resume'] }) {
  const [state, setState] = useState<CardState>('idle')
  const copy = () => {
    void navigator.clipboard?.writeText(resumePrompt(view)).then(() => {
      setState('copied')
      window.setTimeout(() => { setState('idle') }, 2400)
    }).catch(() => { setState('idle') })
  }
  const act = async () => {
    if (state === 'busy') return
    if (resume === undefined || state === 'failed') {
      copy()
      return
    }
    setState('busy')
    try {
      setState(await resume(view))
    } catch {
      setState('failed')
    }
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
      <button type="button" className="ile-handoff__button" onClick={() => { void act() }} disabled={state === 'busy'}>
        {LABEL[state]}
      </button>
      <span className="ile-handoff__hint">{HINT[state]}</span>
    </div>
  </div>
}
