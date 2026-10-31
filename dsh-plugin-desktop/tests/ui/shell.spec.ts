import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { clientPage, createRoot, expectHidden, expectVisible, launchShell, removeRoot, skipDesktopSetup, type Shell } from './fixture.ts'

/**
 * What the learner actually sees. Every assertion here mirrors a decision recorded
 * in AGENTS.md under "视觉层＝皮肤 + 自有品牌": the claude-style skin with our own
 * brand, teal instead of orange, the sidebar reduced to a wordmark, the workspace
 * and permission chrome removed, and the first screen saying "Shapen the world".
 */
describe.sequential('the shell a learner opens', () => {
  let shell: Shell
  let home: string

  beforeAll(async () => {
    home = createRoot()
    shell = await launchShell(home)
    const page = await clientPage(shell.app)
    await page.waitForTimeout(2000)
    await skipDesktopSetup(page)
    await page.waitForTimeout(2000)
  }, 300_000)

  afterAll(async () => {
    await shell?.close()
    if (home !== undefined) removeRoot(home)
  })

  test('the window is branded ensure-ILE while the skin dresses the client', async () => {
    const title = await shell.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle() ?? '')
    expect(title).toBe('ensure-ILE')
    const skin = await shell.page.evaluate(() => document.body.getAttribute('data-dsh-claude-style'))
    expect(skin).not.toBeNull()
    for (const id of ['dsh-desktop-brand-styles', 'dsh-desktop-workspace-styles']) {
      expect(await shell.page.locator('#' + id).count(), id).toBe(1)
    }
  }, 300_000)

  test('the brand lockup was seeded into the data root and reaches the sidebar', async () => {
    const brandDir = join(home, 'home', 'dsh-claude-style', 'brand')
    expect(existsSync(join(brandDir, 'mark.svg'))).toBe(true)
    expect(existsSync(join(brandDir, 'wordmark.svg'))).toBe(true)
    // The wordmark already contains the integral sign, so the square mark beside it
    // is shelved; the collapsed rail keeps it because a rail has no room for text.
    await expectHidden(shell.page.locator('[data-slot="sidebar"] [data-dsh-claude-part~="brand-mark"]').first())
    await expectVisible(shell.page.locator('[data-slot="sidebar"] [data-dsh-claude-part~="brand-name"]').first())
  }, 300_000)

  test('no plugin manager or scheduled-task entry in the sidebar', async () => {
    const labels = await shell.page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-slot="sidebar"] button, [data-slot="sidebar"] a'))
        .map(node => (node.getAttribute('aria-label') ?? '') + ' ' + (node.textContent ?? ''))
        .join('\n'))
    for (const gone of ['插件', 'Plugins', '自动化任务', 'Scheduled tasks']) {
      expect(labels, gone).not.toContain(gone)
    }
  }, 300_000)

  test('the workspace chrome is gone while sessions stay grouped', async () => {
    await expectHidden(shell.page.locator('[data-dsh-claude-part~="workspace-chip-label"]').first())
    await expectHidden(shell.page.locator('[aria-label*="添加工作区"]').first())
    await expectHidden(shell.page.locator('[data-dsh-claude-part~="project-row"] [data-dsh-claude-part~="row-actions"]').first())
    // The grouping header stays: it is what tells the learner which workspace a
    // conversation belongs to.
    await expectVisible(shell.page.locator('[data-dsh-claude-part~="project-row"]').first())
  }, 300_000)

  test('no permission-preset row, because the learner never picks one', async () => {
    expect(await shell.page.locator('.dsh-claude-perm-btn').count()).toBe(0)
  }, 300_000)

  test('the first screen says Shapen the world with our mark above it', async () => {
    const headline = shell.page.locator('[data-dsh-claude-part~="hero-headline"]')
    await expectVisible(headline)
    expect((await headline.innerText()).replace(/\s+/g, ' ').trim()).toContain('Shapen the world')
    await expectVisible(shell.page.locator('[data-dsh-claude-part~="hero-mark"]').first())
  }, 300_000)

  test('an attached image shows up in the composer', async () => {
    const source = join(home, 'probe.png')
    writeFileSync(source, Buffer.from(SAMPLE_PNG, 'base64'))
    await shell.page.locator('input[type=file]').first().setInputFiles(source)
    await expectVisible(shell.page.locator('[data-has-attachments="true"]').first())
    // The thumbnail proves the image itself crossed the boundary, not just its name.
    await expect.poll(() => shell.page.locator('[data-has-attachments] img').count(), { timeout: 15_000 }).toBeGreaterThan(0)
  }, 300_000)

  test('a new conversation opens in the Work preset', async () => {
    await shell.page.locator('[data-slot="sidebar"] [data-dsh-claude-part~="new-session"]').first().click()
    const composer = shell.page.locator('[data-dsh-claude-part~="composer-stack"]').first()
    await expectVisible(composer, 60_000)
    const preset = await composer.evaluate(node =>
      Array.from(node.querySelectorAll('button')).map(button => (button.textContent ?? '').trim()).filter(text => text !== ''))
    expect(preset).toContain('Work')
  }, 300_000)
})

describe.sequential('the preset picker on an empty conversation', () => {
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

  test('offers Work, Chat and Setup, each with the description we wrote', async () => {
    await shell.page.locator('[data-dsh-claude-part~="composer-stack"] button').filter({ hasText: 'Work' }).first().click()
    // The three presets are the reason this shell has an isolated ileModes realm:
    // if that regressed, the picker would be empty because every preset failed.
    await expectVisible(shell.page.getByText('引导、独立做题、答案优化三种模式，在会话里随时换').first(), 20_000)
    await expectVisible(shell.page.getByText('先随便说说话，想做题了再切 Work').first(), 20_000)
    await expectVisible(shell.page.getByText('第一次见面：问清年级、课表、作息和解题偏好，然后告诉学生下一步').first(), 20_000)
    const text = await shell.page.evaluate(() => document.body.innerText)
    for (const old of ['做题', '聊天', '开学']) {
      // Old names must not survive anywhere the learner can read them; the ids did not
      // change, only the labels.
      expect(text.split('\n').filter(line => line.trim() === old), old).toHaveLength(0)
    }
  }, 300_000)

  test('picking Chat switches the conversation to it', async () => {
    await shell.page.getByText('先随便说说话，想做题了再切 Work').first().click()
    await expect.poll(async () =>
      await shell.page.locator('[data-dsh-claude-part~="composer-stack"] button').filter({ hasText: 'Chat' }).count(),
    { timeout: 20_000 }).toBeGreaterThan(0)
  }, 300_000)
})

/** 8x8 PNG, small enough to inline and still a valid image for the upload path. */
const SAMPLE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII='
