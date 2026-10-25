import { HandoffCard, type HandoffCardProps } from './HandoffCard.tsx'
import { installHandoffStyles } from './styles.ts'

/**
 * 浏览器半边能用到的最小 ctx：只声明我们真正调用的成员。
 *
 * 不 import 上游客户端包的类型，是为了让这个包在宿主侧（Node）与浏览器侧
 * 各自独立构建、互不牵连；`tool.call.toolview` 的 owner props 形状由
 * HandoffCardProps 就地声明，字段漂移时卡片退化成不渲染，不会炸整个会话。
 */
export interface BankClientContext {
  /** 注册即 effect：返回 disposer，插件卸载时自动回滚。 */
  effect(fn: () => (() => void) | void, label: string): unknown
  slots: {
    /** 等槽位被声明后再注册，声明消失时自动撤回。 */
    inject(name: string, factory: () => unknown): unknown
    register(options: { name: string; key: string }, component: (props: HandoffCardProps) => unknown): unknown
  }
}

/** Cordis 服务依赖：只等槽位表本身。 */
export const inject = ['slots']

/** 注册题库的浏览器面：目前只有 `bank_resume` 的交接卡片。 @param ctx - 浏览器 Cordis 上下文。 */
export function apply(ctx: BankClientContext): void {
  ctx.effect(installHandoffStyles, 'dsh-plugin-bankmanager: handoff card styles')
  ctx.effect(
    () => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
      { name: 'tool.call.toolview', key: 'bank_resume' },
      HandoffCard,
    )),
    'dsh-plugin-bankmanager: bank_resume card',
  )
}
