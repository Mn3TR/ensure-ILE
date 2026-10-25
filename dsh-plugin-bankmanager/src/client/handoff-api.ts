/**
 * 浏览器半边的取数：只认 `/bank/api` 的两个动作。
 *
 * 失败一律退成「没有数据」——首页入口不画、卡片提示复制兜底，都不抛到会话里。
 * 路由缺席（headless profile）时同样走这里，于是整条链路自己消失。
 */
import { readPendingHandoffs, type PendingHandoff } from './handoff-model.ts'

const API_ROOT = '/bank/api'

/**
 * 发一个动作，取回它的 value。
 * @param method - 动作名（路由后缀）。
 * @param body - JSON 请求体。
 * @returns value，或 undefined（网络/状态/信封任一环不对）。
 */
async function post(method: string, body: unknown): Promise<unknown> {
  try {
    const response = await fetch(`${API_ROOT}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    if (!response.ok) return undefined
    const payload = await response.json() as { ok?: unknown, value?: unknown }
    return payload.ok === true ? payload.value : undefined
  } catch {
    return undefined
  }
}

/** 待接的交接；空数组表示没有、或这条通道不通。 */
export async function fetchPendingHandoffs(): Promise<PendingHandoff[]> {
  return readPendingHandoffs(await post('handoff.pending', {}))
}

/**
 * 把一道交接标成「这个会话接走了」。
 * @param id - 题目 id。
 * @param sessionId - 接走它的会话 id。
 * @returns 是否真的写进去了；false 时这题还会出现在待接里。
 */
export async function consumeHandoff(id: string, sessionId: string): Promise<boolean> {
  return await post('handoff.consume', { id, sessionId }) !== undefined
}
