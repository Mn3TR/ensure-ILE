import { HandoffCard, type ResumeOutcome } from './HandoffCard.tsx'
import { HeroResume } from './HeroResume.tsx'
import { consumeHandoff, fetchPendingHandoffs } from './handoff-api.ts'
import { presetForMode, resumeText, type HandoffView } from './handoff-model.ts'
import { installHandoffStyles } from './styles.ts'

/** 浏览器半边需要的最小会话面：建会话、查目录、拿绑定。 */
interface BankSessions {
  readonly list: { getSnapshot(): { byId: Record<string, unknown> } }
  create(opts: { agentPreset?: string }): Promise<string>
  binding(id: string): { readonly session?: unknown } | undefined
}

/** 导航面：把某个会话挂到主视图。 */
interface BankUiWorkspace {
  openSession(id: string): void
}

/** 输入面：在会话发布前把草稿塞进去。 */
interface BankConversation {
  readonly input: {
    requestDraftInitialization(
      binding: unknown,
      options: { prompt?: string; clearPreviousDraft?: boolean },
    ): unknown
  }
}

/**
 * 浏览器半边能用到的最小 ctx：只声明我们真正调用的成员。
 *
 * 不 import 上游客户端包的类型，是为了让这个包在宿主侧（Node）与浏览器侧
 * 各自独立构建、互不牵连；槽位组件的 owner props 形状由各自 Props 就地声明，
 * 字段漂移时卡片/入口退化成不渲染，不会炸整个会话。
 */
export interface BankClientContext {
  /** 注册即 effect：返回 disposer，插件卸载时自动回滚。 */
  effect(fn: () => (() => void) | void, label: string): unknown
  /** 可选服务读取：headless 或测试环境里没有就是 undefined。 */
  get(name: string): unknown
  slots: {
    /** 等槽位被声明后再注册，声明消失时自动撤回。 */
    inject(name: string, factory: () => unknown): unknown
    register(
      options: {
        name: string
        key?: string
        id?: string
        order?: number
        inject?: () => Record<string, unknown>
      },
      component: unknown,
    ): unknown
  }
}

/** Cordis 服务依赖：槽位表、会话、导航；输入面按可选服务取。 */
export const inject = ['slots', 'sessions', 'uiWorkspace']

/** 记住「这道交接上一次开的是哪个会话」，让重复点击变成跳转而不是再开一个。 */
const RESUME_MEMO_PREFIX = 'dsh-plugin-bankmanager:resume:'

function memoRead(id: string): string | undefined {
  try {
    return window.localStorage.getItem(RESUME_MEMO_PREFIX + id) ?? undefined
  } catch {
    return undefined
  }
}

function memoWrite(id: string, sessionId: string): void {
  try {
    window.localStorage.setItem(RESUME_MEMO_PREFIX + id, sessionId)
  } catch { /* 存不下就每次新建，功能不缺 */ }
}

/**
 * 等会话绑定落地。openSession 同步 retain，但生成物可能还在装配；
 * 这里只等一小会儿，等不到就放弃填草稿（学生自己打一句照样能接着做）。
 * @param sessions - 会话服务。
 * @param id - 刚打开/创建的会话。
 * @returns 绑定，或 undefined。
 */
async function bindingOf(sessions: BankSessions, id: string): Promise<{ readonly session?: unknown } | undefined> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const binding = sessions.binding(id)
    if (binding !== undefined) return binding
    await new Promise((resolve) => { window.setTimeout(resolve, 20) })
  }
  return sessions.binding(id)
}

/**
 * 点「接着做」：开一个目标模式的新会话，把上次那道题（带状态）放进输入框，
 * 再把这题标成已被这个会话接走。已有会话就只跳转，不重开。
 * @param ctx - 浏览器根上下文。
 * @param view - 卡片上的交接。
 * @returns 三种结局，卡片按它选提示。
 */
async function openResume(ctx: BankClientContext, view: HandoffView): Promise<ResumeOutcome> {
  const sessions = ctx.get('sessions') as BankSessions | undefined
  const uiWorkspace = ctx.get('uiWorkspace') as BankUiWorkspace | undefined
  if (sessions === undefined) return 'failed'

  const remembered = memoRead(view.id)
  if (remembered !== undefined && sessions.list.getSnapshot().byId[remembered] !== undefined) {
    uiWorkspace?.openSession(remembered)
    return 'opened'
  }

  const preset = presetForMode(view.to)
  let sessionId: string
  try {
    sessionId = await sessions.create(preset === undefined ? {} : { agentPreset: preset })
  } catch {
    return 'failed'
  }
  memoWrite(view.id, sessionId)
  uiWorkspace?.openSession(sessionId)

  const conversation = ctx.get('conversation') as BankConversation | undefined
  if (conversation !== undefined) {
    const binding = await bindingOf(sessions, sessionId)
    if (binding !== undefined) {
      try {
        conversation.input.requestDraftInitialization(binding, {
          prompt: resumeText(view),
          clearPreviousDraft: true,
        })
      } catch { /* 草稿塞不进去不影响已经开好的会话 */ }
    }
  }

  return await consumeHandoff(view.id, sessionId) ? 'opened' : 'opened-unconsumed'
}

/**
 * 注册题库的浏览器面：聊天里的交接卡片，和空白会话首页的「接着上次的题」。
 * @param ctx - 浏览器 Cordis 上下文。
 */
export function apply(ctx: BankClientContext): void {
  ctx.effect(installHandoffStyles, 'dsh-plugin-bankmanager: handoff card styles')
  ctx.effect(
    () => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
      {
        name: 'tool.call.toolview',
        key: 'bank_resume',
        inject: () => ({ resume: (view: HandoffView) => openResume(ctx, view) }),
      },
      HandoffCard,
    )),
    'dsh-plugin-bankmanager: bank_resume card',
  )
  ctx.effect(
    () => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register(
      {
        name: 'conversation.hero.options',
        id: 'ile-resume',
        order: 20,
        inject: () => ({
          loadPending: fetchPendingHandoffs,
          consume: consumeHandoff,
        }),
      },
      HeroResume,
    )),
    'dsh-plugin-bankmanager: hero resume entry',
  )
}
