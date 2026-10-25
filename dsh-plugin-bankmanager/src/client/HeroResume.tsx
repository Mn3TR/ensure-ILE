import { useEffect, useRef, useState } from 'react'
import { resumeSentence, type PendingHandoff } from './handoff-model.ts'

/** 首页入口能拿到的两份数据：当前空白会话，和它上面的输入框动作。 */
export interface HeroResumeProps {
  readonly sessionId?: string
  /** 会话作用域槽位给的输入动作；点一下只是把话填进输入框，不替学生发。 */
  readonly inputActions?: { setDraft(text: string): void }
  /** 注册时注入的取数；通道不通时返回空数组。 */
  readonly loadPending?: () => Promise<PendingHandoff[]>
  /** 注册时注入的认领动作；失败不影响已经填好的输入框。 */
  readonly consume?: (id: string, sessionId: string) => Promise<boolean>
}

/**
 * 空白会话首页那一行「接着上次的题」。
 *
 * 不点的时候什么都不动——输入框原样；点一下只把上次那道题（带状态）填进输入框，
 * 发不发、改不改都由学生自己决定，符合「零注入」：模型看到的是学生发的那句话。
 */
export function HeroResume({ sessionId, inputActions, loadPending, consume }: HeroResumeProps) {
  const [items, setItems] = useState<PendingHandoff[]>([])
  const [taken, setTaken] = useState<string | undefined>(undefined)
  // 注入面每次渲染都是新函数，挂在依赖里会无限重取；只在挂载时读一次。
  const loader = useRef(loadPending)
  loader.current = loadPending
  useEffect(() => {
    let live = true
    void loader.current?.().then((pending) => {
      if (live) setItems(pending)
    }, () => { /* 取不到就是不画，不打扰学生 */ })
    return () => { live = false }
  }, [])
  if (items.length === 0) return null
  return <div className="ile-resume">
    {items.slice(0, 3).map(item => <button
      key={item.id}
      type="button"
      className="ile-resume__chip"
      onClick={() => {
        inputActions?.setDraft(resumeSentence(item.id, item.status))
        setTaken(item.id)
        if (sessionId !== undefined && consume !== undefined) void consume(item.id, sessionId)
      }}
    >
      {taken === item.id ? '已填进输入框' : `接着上次的题 · ${item.id}`}
    </button>)}
  </div>
}
