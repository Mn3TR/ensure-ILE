import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { join } from 'node:path'
import type { Locator, Page } from 'playwright-core'
import { clientPage, createRoot, expectVisible, launchShell, removeRoot, skipDesktopSetup, type Shell } from './fixture.ts'
import { startFakeDeepSeek, type FakeDeepSeek } from './fake-deepseek.ts'

/**
 * 这一层用真 Electron 配本地假端点，把**壳发出去的请求**当断言面：提示词与工具面、
 * 带历史、切模式后的折叠、以及 429 之后的重试。端点只答协议、不做语义，所以每一条
 * 断言说的都是壳自己的行为，不是假服务想听什么。
 */

/** 交接摘要，带一个足以认出来的特征串。 */
const HANDOFF_SUMMARY = '做到第三问卡住了，下一步从换元开始（handoff-probe）'

// 每轮脚本一句不同的回复：「这一轮说完了」才有唯一锚点。同一句话连着出现两次时，
// 等文本可见会被上一轮的气泡骗过去（429 那条就踩过：重试还没发生断言就跑了）。
const REPLY_FIRST = '第 1 轮：先说说你卡在哪一步。'
const REPLY_SECOND = '第 2 轮：读两遍也算读，卡在哪儿？'
const REPLY_SWITCH = '切到独立做题：这一步你自己试，卡住再叫我。'
const REPLY_FOLDED = '第 4 轮：接手了，从换元开始。'
const REPLY_RETRY = '第 5 轮：429 过去了，我还在。'
/** 折叠后学生说的那句，带回声探针，好在合并后的消息里认出来。 */
const FOLDED_ASK = '接着来（fold-probe）'

/** 线上的一条消息（Anthropic Messages 形状）。 */
interface WireMessage {
  readonly role: string
  readonly content: readonly Record<string, unknown>[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 对话那一轮的请求。**一轮会发两个请求**（对话 + AI 标题生成），标题请求不带
 * `tools`，所以一律按这个筛，别取 requests[0]。
 */
function turnRequests(fake: FakeDeepSeek): Record<string, unknown>[] {
  return fake.requests.filter(request => Array.isArray(request.tools) && request.tools.length > 0)
}

function wireMessages(request: Record<string, unknown>): WireMessage[] {
  const raw = Array.isArray(request.messages) ? request.messages : []
  return raw.flatMap(message => {
    if (!isRecord(message)) return []
    const role = typeof message.role === 'string' ? message.role : '?'
    const content = (Array.isArray(message.content) ? message.content : []).filter(isRecord)
    return [{ role, content }]
  })
}

/** 一条消息里的正文（工具结果之类不算）。 */
function textOf(message: WireMessage): string {
  return message.content
    .map(block => (block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .join('\n')
}

function toolNames(request: Record<string, unknown>): string[] {
  const tools = Array.isArray(request.tools) ? request.tools : []
  return tools.flatMap(tool => (isRecord(tool) && typeof tool.name === 'string' ? [tool.name] : []))
}

function systemOf(request: Record<string, unknown>): string {
  return typeof request.system === 'string' ? request.system : ''
}

/** 取下标处的元素，缺了就报一条能读懂的错，省得每个断言都塞 !。 */
function at<T>(items: readonly T[], index: number, what: string): T {
  const value = items[index]
  if (value === undefined) throw new Error('没有第 ' + String(index) + ' 条' + what)
  return value
}

describe.sequential('一轮对话在线上长什么样', () => {
  let shell: Shell
  let home: string
  let fake: FakeDeepSeek
  let page: Page
  let input: Locator

  beforeAll(async () => {
    home = createRoot()
    fake = await startFakeDeepSeek(join(home, 'fake-deepseek'))
    shell = await launchShell(home, {
      env: { DEEPSEEK_BASE_URL: fake.url, DEEPSEEK_API_KEY: 'dummy-key' },
    })
    page = await clientPage(shell.app)
    await page.waitForTimeout(2000)
    await skipDesktopSetup(page)
    await page.waitForTimeout(1500)
    input = page
      .locator('[data-dsh-claude-part~="composer-stack"]')
      .first()
      .locator('textarea, [contenteditable="true"], input[type="text"]')
      .first()
    await expectVisible(input, 60_000)
  }, 300_000)

  afterAll(async () => {
    await shell?.close()
    await fake?.close()
    if (home !== undefined) removeRoot(home)
  })

  /**
   * 发一句学生消息，等到这一轮独有的那句回复上屏，并且这一轮真的收尾。
   * 「停止生成」按钮只在跑的时候在文档里，它消失就说明可以发下一句了。
   */
  async function ask(text: string, expectedReply: string): Promise<void> {
    await input.click()
    await input.fill(text)
    await input.press('Enter')
    await expectVisible(page.getByText(expectedReply, { exact: false }).first(), 180_000)
    await expect.poll(() => page.locator('button[aria-label="停止生成"]').count(), { timeout: 120_000 }).toBe(0)
    await page.waitForTimeout(300)
  }

  test('首轮请求带的是做题会话的整套提示词与 30 个工具', async () => {
    const started = Date.now()
    fake.script([{ kind: 'text', text: REPLY_FIRST }])
    await ask('我有道数学题不会', REPLY_FIRST)

    const requests = turnRequests(fake)
    // 一轮只有一次对话请求；标题生成那一发没有 tools，不该出现在这里。
    expect(requests, '首轮应当只有一次对话请求').toHaveLength(1)
    const request = at(requests, 0, '对话请求')

    expect(request.model).toBe('deepseek-flash')
    expect(request.stream).toBe(true)
    expect(request.max_tokens).toBe(256000)
    // 推理开关与强度是壳写死的请求头状态，丢了模型就不「想」了。
    expect(request.thinking, 'thinking').toBeDefined()
    expect(request.output_config, 'output_config').toBeDefined()

    const messages = wireMessages(request)
    expect(messages.map(message => message.role)).toEqual(['user'])
    expect(textOf(at(messages, 0, '首条消息'))).toContain('我有道数学题不会')

    const system = systemOf(request)
    expect(system.length, 'system 提示词长度').toBeGreaterThan(3000)
    expect(system).toContain('## 切换模式')

    const names = toolNames(request)
    expect(names, '工具数').toHaveLength(30)
    for (const needed of [
      'read_note',
      'context_switch',
      'bank_add',
      'bank_list',
      'bank_resume',
      'bank_stats',
      'textbook_books',
      'textbook_find',
      'textbook_read',
      'schedule_read',
      'schedule_update',
      'schedule_plan',
    ]) {
      expect(names, '工具 ' + needed).toContain(needed)
    }
    const tools = Array.isArray(request.tools) ? request.tools : []
    for (const [index, tool] of tools.entries()) {
      expect(isRecord(tool) && 'input_schema' in tool, '第 ' + String(index) + ' 个工具没有 input_schema').toBe(true)
    }
    // 画像字段藏在 bank_update 的嵌套参数里，工具描述表一被裁这里就没了。
    const bankUpdate = tools.find(tool => isRecord(tool) && tool.name === 'bank_update')
    const schema = JSON.stringify(isRecord(bankUpdate) ? bankUpdate.input_schema : {})
    expect(schema).toContain('preference')
    expect(schema).toContain('improvement')

    console.log('  [首轮请求形状] ' + String(Date.now() - started) + ' ms, system ' + String(system.length)
      + ' 字符, tools ' + String(names.length))
  }, 300_000)

  test('第二轮把上一轮的问答一起发回去', async () => {
    const started = Date.now()
    fake.script([{ kind: 'text', text: REPLY_SECOND }])
    await ask('我读了两遍还是没思路', REPLY_SECOND)

    const requests = turnRequests(fake)
    expect(requests).toHaveLength(2)
    const messages = wireMessages(at(requests, 1, '第二轮对话请求'))
    expect(messages.map(message => message.role)).toEqual(['user', 'assistant', 'user'])
    expect(textOf(at(messages, 0, '第一条 user'))).toContain('我有道数学题不会')
    expect(textOf(at(messages, 1, 'assistant 消息'))).toContain(REPLY_FIRST)
    expect(textOf(at(messages, 2, '第二条 user'))).toContain('我读了两遍还是没思路')

    console.log('  [第二轮带历史] ' + String(Date.now() - started) + ' ms, messages '
      + String(messages.length))
  }, 300_000)

  test('context_switch 之后，下一次开口时旧历史被折成一条交接通知', async () => {
    const started = Date.now()
    const beforeSwitch = turnRequests(fake).length
    fake.script([
      { kind: 'tool_use', name: 'context_switch', input: { to: 'work', summary: HANDOFF_SUMMARY } },
      { kind: 'text', text: REPLY_SWITCH },
    ])
    await ask('先切到独立做题，我自己试试', REPLY_SWITCH)

    const afterSwitch = turnRequests(fake).slice(beforeSwitch)
    // 工具调用 → 回执，一次回合内两次模型请求。
    expect(afterSwitch, '一次工具调用应当产生两次对话请求').toHaveLength(2)
    const withResult = afterSwitch.find(request =>
      wireMessages(request).some(message => message.content.some(block => block.type === 'tool_result')))
    if (withResult === undefined) throw new Error('没有一发请求带回工具结果')
    // 历史里有多条 assistant（前两轮都是），要挑带工具调用那条，别拿第一条。
    const calls = wireMessages(withResult)
      .flatMap(message => message.content)
      .filter(block => block.type === 'tool_use')
    expect(calls.map(call => call.name), '工具调用').toContain('context_switch')
    const result = wireMessages(withResult)
      .flatMap(message => message.content)
      .find(block => block.type === 'tool_result')
    expect(JSON.stringify(result ?? {}), '工具回执里应当说已经安排切换').toContain('独立做题')

    // 页面稳定后再开口：pre-step 在 turn 边界折叠。
    const beforeFold = turnRequests(fake).length
    fake.script([{ kind: 'text', text: REPLY_FOLDED }])
    await ask(FOLDED_ASK, REPLY_FOLDED)
    const folded = at(turnRequests(fake).slice(beforeFold), 0, '折叠后的对话请求')
    const messages = wireMessages(folded)
    // 折叠把 nodes[1..] 换成一条交接 user/message；页面上它与学生这句相邻，
    // 序列化时相邻同角色会并进同一条，所以线上只剩一条 user。
    expect(messages.map(message => message.role), '折叠后不该再有 assistant 轮次').toEqual(['user'])
    const notice = textOf(at(messages, 0, '折叠后的消息'))
    expect(notice).toContain('【交接】')
    expect(notice).toContain(HANDOFF_SUMMARY)
    expect(notice, '学生这句也要在同一条里').toContain(FOLDED_ASK)
    // 提示词跟着模式走：这一发的 system 已经是 work 人格。
    expect(systemOf(folded), '折叠后的 system 应当换成人格').toContain('学生自己做这道题')

    // 折叠通知与学生这句在页面上是相邻两条 user，序列化时并进同一条：这里量一下
    // 实际的文本块数，别把「两条」当结论写进文档。
    const blocks = at(messages, 0, '折叠后的消息').content
      .map(block => String(block.type))
      .join(',')

    console.log('  [context_switch 折叠] ' + String(Date.now() - started) + ' ms, 折叠后 messages '
      + String(messages.length) + ' 条 [' + blocks + '], 正文 ' + String(notice.length) + ' 字符')
  }, 300_000)

  test('429 之后仍然拿到回复，并记下实际重试了几次', async () => {
    const started = Date.now()
    const servedBefore = fake.served.length
    fake.script([{ kind: 'failure', status: 429 }, { kind: 'text', text: REPLY_RETRY }])
    await ask('再讲一遍这题', REPLY_RETRY)

    const served = fake.served.slice(servedBefore)
    expect(at(served, 0, '脚本响应'), '第一发应当是错误').toMatchObject({ kind: 'failure', status: 429 })
    const failures = served.filter(reply => reply.kind === 'failure').length
    // 失败一次 + 重试成功一次 = 正好两次；多出来就说明重试链在别处又跑了一轮。
    expect(served).toHaveLength(2)
    expect(failures).toBe(1)
    expect(served.at(-1)?.kind, '最后一发应当是成功的文本').toBe('text')

    console.log('  [429 重试] ' + String(Date.now() - started) + ' ms, 重试 '
      + String(served.length - 1) + ' 次')
  }, 300_000)
})
