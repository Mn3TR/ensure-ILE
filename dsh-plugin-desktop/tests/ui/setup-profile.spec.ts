import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from 'playwright-core'
import { clientPage, createRoot, expectVisible, launchShell, removeRoot, skipDesktopSetup, type Shell } from './fixture.ts'
import { startFakeDeepSeek, type FakeDeepSeek } from './fake-deepseek.ts'

/** Exercise the actual setup tool, then read its facts through another preset's profile tool. */
describe.sequential('开学信息跨模式进入学生档案', () => {
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
    await pickPreset('第一次见面：问清年级、课表、作息和解题偏好，然后告诉学生下一步')
    input = page.locator('[data-dsh-claude-part~="composer-stack"]').first()
      .locator('textarea, [contenteditable="true"], input[type="text"]').first()
    await expectVisible(input, 60_000)
  }, 300_000)

  afterAll(async () => {
    await shell?.close()
    await fake?.close()
    if (home !== undefined) removeRoot(home)
  })

  async function pickPreset(description: string): Promise<void> {
    await page.locator('[data-dsh-claude-part~="composer-stack"] button')
      .filter({ hasText: /Work|Chat|Setup/ }).first().click()
    await page.getByText(description, { exact: true }).click()
  }

  async function ask(text: string, reply: string): Promise<void> {
    await input.fill(text)
    await input.press('Enter')
    await expectVisible(page.getByText(reply, { exact: false }).first(), 120_000)
    await expect.poll(() => page.locator('button[aria-label="停止生成"]').count(), { timeout: 120_000 }).toBe(0)
  }

  function turns(): Record<string, unknown>[] {
    return fake.requests.filter(request => Array.isArray(request.tools) && request.tools.length > 0)
  }

  test('setup_update 写入的偏好可在新 Chat 会话通过 profile_read 读回', async () => {
    const facts = { grade: '高一', schedule: '周一有晚自习', rhythm: '晚上八点到家', preference: '先想再动笔，偏几何' }
    const setupReply = '开学情况已保存（setup-profile-written）'
    fake.script([
      { kind: 'tool_use', name: 'setup_update', input: { ...facts, onboarding: 'done', next: '发来一道想讨论的题' } },
      { kind: 'text', text: setupReply },
    ])
    await ask('我高一，周一晚自习，八点到家，喜欢先想，偏几何。接着做题吧。', setupReply)
    const state = JSON.parse(readFileSync(join(home, 'home', 'setup.json'), 'utf8'))
    expect(state.onboarding).toBe('done')
    expect(state.got).toEqual(facts)
    for (const [name, value] of Object.entries(facts)) {
      expect(readFileSync(join(home, 'home', 'profile', name + '.md'), 'utf8').trim()).toBe(value)
    }

    await page.locator('[data-slot="sidebar"] [data-dsh-claude-part~="new-session"]').click()
    await pickPreset('先随便说说话，想做题了再切 Work')
    const before = turns().length
    const readReply = '新会话读到了偏好（setup-profile-read）'
    fake.script([
      { kind: 'tool_use', name: 'profile_read', input: { name: 'preference' } },
      { kind: 'text', text: readReply },
    ])
    await ask('读取我的解题偏好', readReply)
    const requests = turns().slice(before)
    expect(requests).toHaveLength(2)
    expect(String(requests[0]?.system)).toContain('# 聊天')
    expect(String(requests[0]?.system)).toContain('`Work` 是预设名')
    expect(JSON.stringify(requests[1]?.messages)).toContain(facts.preference)
  }, 300_000)

  test('Chat 请求切换后当轮保留旧模式，下次发言收到更新后的 HRL 规则', async () => {
    const before = turns().length
    const switchReply = '已安排答案优化，下次发言生效（setup-profile-switch）'
    fake.script([
      { kind: 'tool_use', name: 'context_switch', input: { to: 'hrl', summary: '已有答案 x=2；从第一步开始比较（profile-switch-probe）' } },
      { kind: 'text', text: switchReply },
    ])
    await ask('已有答案 x=2，我要切到答案优化模式。', switchReply)
    const switching = turns().slice(before)
    expect(switching).toHaveLength(2)
    expect(switching.every(request => String(request.system).includes('# 聊天'))).toBe(true)

    const foldedReply = '现在从第一步比较（setup-profile-hrl）'
    const beforeFold = turns().length
    fake.script([{ kind: 'text', text: foldedReply }])
    await ask('从第一步开始', foldedReply)
    const request = turns()[beforeFold]
    const system = String(request?.system)
    expect(system).toContain('# 答案优化')
    expect(system).toContain('profile_read({ name: "preference" })')
    expect(system).toContain('chosen: student')
    expect(system).toContain('整条轨迹是否满足题设')
    expect(system).not.toContain('教师版 + 他改过的步')
    expect(JSON.stringify(request?.messages)).toContain('profile-switch-probe')
  }, 300_000)
})
