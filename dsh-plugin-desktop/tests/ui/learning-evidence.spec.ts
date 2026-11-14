import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from 'playwright-core'
import { clientPage, createRoot, expectVisible, launchShell, removeRoot, skipDesktopSetup, type Shell } from './fixture.ts'
import { startFakeDeepSeek, type FakeDeepSeek } from './fake-deepseek.ts'

/** Real Host tools and storage; scripted model responses do not assess teaching quality. */
describe('学习证据与隐藏旧解的复习链路', () => {
  let shell: Shell
  let home: string
  let fake: FakeDeepSeek
  let page: Page
  let input: Locator

  beforeAll(async () => {
    home = createRoot()
    fake = await startFakeDeepSeek(join(home, 'fake-deepseek'))
    shell = await launchShell(home, { env: { DEEPSEEK_BASE_URL: fake.url, DEEPSEEK_API_KEY: 'dummy-key' } })
    page = await clientPage(shell.app)
    await page.getByRole('button', { name: '跳过', exact: true }).first().waitFor({ state: 'visible', timeout: 120_000 })
    await skipDesktopSetup(page)
    input = page.locator('[data-dsh-claude-part~="composer-stack"]').first()
      .locator('textarea, [contenteditable="true"], input[type="text"]').first()
    await expectVisible(input, 60_000)
  }, 300_000)

  afterAll(async () => {
    await shell?.close()
    await fake?.close()
    if (home !== undefined) removeRoot(home)
  })

  function turns(): Record<string, unknown>[] {
    return fake.requests.filter(request => Array.isArray(request.tools) && request.tools.length > 0)
  }

  async function ask(text: string, reply: string): Promise<void> {
    await input.fill(text)
    await input.press('Enter')
    await expectVisible(page.getByText(reply, { exact: false }).first(), 120_000)
    await expect.poll(() => page.locator('button[aria-label="停止生成"]').count(), { timeout: 120_000 }).toBe(0)
  }

  test('真实 bank 工具保留帮助证据、隐藏旧解并据延迟提取证据调度', async () => {
    const statement = 'x²=1，求实数解集'
    fake.script([
      { kind: 'tool_use', name: 'bank_add', input: { statement, subject: 'math' } },
      { kind: 'text', text: '题目已登记（learning-created）' },
    ])
    await ask('帮我登记这道题：' + statement, '题目已登记（learning-created）')
    const directory = join(home, 'home', 'bank', 'problems')
    const id = readdirSync(directory, { withFileTypes: true }).find(entry => entry.isDirectory())!.name
    const recordFile = join(directory, id, 'problem.json')
    const record = () => JSON.parse(readFileSync(recordFile, 'utf8'))
    const first = turns()[0]
    expect(String(first?.system)).toContain('帮助逐渐撤掉')
    expect(String(first?.system)).toContain('承认学生明确表达的困难')
    expect(String(first?.system)).toContain('recall: true')

    const oldSolution = 'OLD_SOLUTION_NOT_FOR_RECALL_VIEW'
    fake.script([
      { kind: 'tool_use', name: 'bank_update', input: {
        id, status: 'review', guideOutcome: 'solved', guideResult: oldSolution,
        learningEvidence: { context: 'guided', support: 'example', outcome: 'solved', answer: '解集是 {-1, 1}' },
      } },
      { kind: 'text', text: '已记录示范后的完成（learning-guided）' },
    ])
    await ask('看过小示范后我完成了，解集是 {-1, 1}。', '已记录示范后的完成（learning-guided）')
    expect(record().learning.evidence[0]).toMatchObject({ context: 'guided', support: 'example' })
    expect(record().review.interval).toBe(1)
    expect(record().review.count).toBe(0)

    const beforeRecall = turns().length
    fake.script([
      { kind: 'tool_use', name: 'bank_show', input: { id, recall: true } },
      { kind: 'text', text: '这里只呈现原题（learning-recall-view）' },
    ])
    await ask('先给我原题，不展示旧答案。', '这里只呈现原题（learning-recall-view）')
    const returned = turns()[beforeRecall + 1]
    const messages = returned?.messages as { content?: { type?: string; content?: unknown }[] }[]
    const toolResults = messages.flatMap(message => Array.isArray(message.content)
      ? message.content.filter(block => block.type === 'tool_result') : [])
    const lastResult = JSON.stringify(toolResults.at(-1))
    expect(lastResult).toContain(statement)
    expect(lastResult).not.toContain(oldSolution)
    expect(lastResult).not.toContain('learning')

    fake.script([
      { kind: 'tool_use', name: 'bank_update', input: { id, learningEvidence: {
        context: 'delayed-recall', support: 'none', outcome: 'solved', answer: '由 x²−1=(x−1)(x+1)=0，解集是 {-1, 1}。',
      } } },
      { kind: 'text', text: '独立提取证据已保存（learning-recalled）' },
    ])
    await ask('这次独立写出：由 x²−1=(x−1)(x+1)=0，解集是 {-1, 1}。', '独立提取证据已保存（learning-recalled）')
    const saved = record()
    expect(saved.learning.evidence).toHaveLength(2)
    expect(saved.learning.evidence[0].support).toBe('example')
    expect(saved.learning.evidence[1]).toMatchObject({ context: 'delayed-recall', support: 'none', outcome: 'solved' })
    expect(saved.review.interval).toBe(3)
    expect(saved.review.count).toBe(1)
  }, 300_000)
})
