import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { clientPage, createRoot, expectVisible, launchShell, removeRoot, skipDesktopSetup, type Shell } from './fixture.ts'

/**
 * The long path a first launch takes when the seven-screen wizard is enabled
 * (`ENSURE_ILE_SETUP=full`): every heading must stay on one line under the size
 * clamp we set, and finishing must be remembered by the next launch.
 */
describe.sequential('the seven-screen wizard', () => {
  let shell: Shell
  let home: string
  const headings: string[] = []

  beforeAll(async () => {
    home = createRoot()
    shell = await launchShell(home, { setup: 'full' })
  }, 300_000)

  afterAll(async () => {
    await shell?.close()
    if (home !== undefined) removeRoot(home)
  })

  test('walks every screen without breaking a heading', async () => {
    const page = await clientPage(shell.app)
    await page.waitForTimeout(3000)
    await page.getByRole('button', { name: '开始设置', exact: true }).first().click()
    for (let step = 0; step < 6; step++) {
      await page.waitForTimeout(500)
      const screen = await page.evaluate(() => {
        const heading = document.querySelector('h1')
        if (heading === null) return null
        return {
          text: heading.innerText.trim(),
          size: Number.parseFloat(getComputedStyle(heading).fontSize),
          lines: heading.getClientRects().length,
        }
      })
      expect(screen, 'step ' + step).not.toBeNull()
      headings.push(screen!.text)
      // src/client/onboarding.css clamps the heading; a wider rule would wrap
      // "ensure-ILE" onto a second line, which is what this asserts against.
      expect(screen!.size, screen!.text).toBeLessThanOrEqual(40)
      expect(screen!.lines, screen!.text).toBe(1)
      const forward = step === 5 ? '开始使用' : '下一步'
      await page.getByRole('button', { name: forward, exact: true }).first().click()
      await page.waitForTimeout(700)
    }
    await expectVisible(page.locator('[data-dsh-claude-part~="composer-stack"]').first(), 120_000)
    expect(headings).toEqual([
      '选择窗口模式',
      '选择窗口材质',
      '选择插件市场',
      '设置桌面通知',
      '设置浏览器访问',
      '设置完成',
    ])
  }, 300_000)

  test('records the finished setup where the next launch reads it', async () => {
    // The shell writes this a moment after the wizard closes, so poll instead of
    // reading once: a single read races the write and sees an empty directory.
    const outcome = () => {
      const [state] = globSync(join(home, 'appdata', 'profile-setup', '*', 'state.json'))
      if (state === undefined) return 'missing'
      try {
        return (JSON.parse(readFileSync(state, 'utf8')) as { outcome?: string }).outcome ?? 'unreadable'
      } catch {
        return 'unreadable'
      }
    }
    await expect.poll(outcome, { timeout: 30_000 }).toBe('completed')
    expect(globSync(join(home, 'appdata', 'profile-setup', '*', 'state.json.pending'))).toEqual([])
  }, 300_000)
})

describe.sequential('a data root that already finished setup', () => {
  let shell: Shell
  let home: string

  beforeAll(async () => {
    home = createRoot()
    shell = await launchShell(home)
    const page = await clientPage(shell.app)
    await page.waitForTimeout(2000)
    await skipDesktopSetup(page)
    await shell.app.close()
    shell = await launchShell(home)
    const reloaded = await clientPage(shell.app)
    await reloaded.waitForTimeout(2500)
  }, 300_000)

  afterAll(async () => {
    await shell?.close()
    if (home !== undefined) removeRoot(home)
  })

  test('comes back to the conversation instead of the wizard', async () => {
    const page = await clientPage(shell.app)
    expect(await page.getByRole('button', { name: '开始设置', exact: true }).count()).toBe(0)
    await expectVisible(page.locator('[data-dsh-claude-part~="composer-stack"]').first(), 120_000)
  }, 300_000)
})
