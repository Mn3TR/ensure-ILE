import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { clientPage, createRoot, expectHidden, expectVisible, launchShell, removeRoot, skipDesktopSetup, type Shell } from './fixture.ts'

const SAMPLE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII='

/**
 * The rest of the surface we changed: both colour schemes, the chrome a learner can
 * still reach (settings, sidebar collapse), and the composer's own behaviours.
 */
describe.sequential('the surface around the conversation', () => {
  let shell: Shell
  let home: string

  beforeAll(async () => {
    home = createRoot()
    shell = await launchShell(home)
    const page = await clientPage(shell.app)
    await page.waitForTimeout(2000)
    await skipDesktopSetup(page)
    await page.waitForTimeout(1500)
  }, 300_000)

  afterAll(async () => {
    await shell?.close()
    if (home !== undefined) removeRoot(home)
  })

  test('both schemes paint, and neither falls back to the skin orange', async () => {
    const canvas = () => shell.page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
    const light = await canvas()
    expect(light).toBe('rgb(255, 255, 255)')
    await shell.page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(canvas, { timeout: 20_000 }).not.toBe(light)
    const dark = await canvas()
    expect(Math.max(...(dark.match(/\d+/g) ?? ['255']).slice(0, 3).map(Number))).toBeLessThan(80)
    await shell.page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(canvas, { timeout: 20_000 }).toBe(light)
  }, 300_000)

  test('collapsing the sidebar leaves only the integral sign', async () => {
    const sidebar = '[data-slot="sidebar"]'
    await shell.page.locator('[aria-label*="收起侧边栏"]').first().click()
    await expectVisible(shell.page.locator(`${sidebar} [data-dsh-claude-part~="rail-mark"]`).first())
    await expectVisible(shell.page.locator('[aria-label="打开侧边栏"]').first())
    await expectHidden(shell.page.locator('[data-dsh-claude-part="brand-name"]').first())
    await shell.page.locator('[aria-label="打开侧边栏"]').first().click()
    await expectVisible(shell.page.locator('[data-dsh-claude-part="brand-name"]').first())
    await expectVisible(shell.page.locator('[aria-label*="收起侧边栏"]').first())
  }, 300_000)

  test('settings still open, and the plugin market is not one of them', async () => {
    await shell.page.locator('[aria-label="账号菜单"], [data-dsh-claude-part~="account-menu"]').first().click()
    const settings = shell.page.getByText('设置', { exact: true }).first()
    await expectVisible(settings)
    await settings.click()
    const dialog = shell.page.locator('[data-slot="dialog-content"], [role="dialog"]').first()
    await expectVisible(dialog, 20_000)
    const text = await dialog.innerText()
    expect(text).toContain('桌面设置')
    for (const gone of ['插件市场', 'Plugin market']) expect(text).not.toContain(gone)
    await shell.page.keyboard.press('Escape')
  }, 300_000)

  test('the composer keeps its placeholder and drops an attachment again', async () => {
    const composer = shell.page.locator('[data-dsh-claude-part~="composer-stack"]').first()
    expect(await composer.innerText()).toContain('描述任务或提出问题')
    const source = join(home, 'drop.png')
    writeFileSync(source, Buffer.from(SAMPLE_PNG, 'base64'))
    await shell.page.locator('input[type=file]').first().setInputFiles(source)
    await expectVisible(shell.page.locator('[data-has-attachments="true"]').first())
    const remove = shell.page.locator('[aria-label*="移除"], [aria-label*="删除附件"], [aria-label*="Remove"]').first()
    await expectVisible(remove)
    await remove.click()
    await expect.poll(async () => await shell.page.locator('[data-has-attachments="true"]').count(), { timeout: 15_000 }).toBe(0)
  }, 300_000)
})
