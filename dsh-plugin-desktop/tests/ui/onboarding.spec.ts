import { afterAll, describe, expect, test } from 'vitest'
import { clientPage, createRoot, expectVisible, launchShell, removeRoot, skipDesktopSetup, type Shell } from './fixture.ts'

/**
 * First launch on a machine that has never run ensure-ILE: the desktop setup screen
 * is the only thing between the learner and the product, and skipping it must land
 * on the conversation screen instead of a restart loop.
 */
describe('a fresh data root', () => {
  let shell: Shell
  let home: string

  afterAll(async () => {
    await shell?.close()
    if (home !== undefined) removeRoot(home)
  })

  test('offers the setup screen once and then the conversation screen', async () => {
    home = createRoot()
    shell = await launchShell(home)
    const page = await clientPage(shell.app)
    const start = page.getByRole('button', { name: '开始设置' })
    const skip = page.getByRole('button', { name: '跳过' })
    await expect.poll(async () => (await skip.count()) + (await start.count()), { timeout: 120_000 }).toBeGreaterThan(0)
    await expectVisible(start.first())
    expect(await page.evaluate(() => document.body.innerText)).toContain('ensure-ILE')
    await skipDesktopSetup(page)
    await expectVisible(page.locator('[data-dsh-claude-part~="hero-headline"]').first(), 60_000)
  }, 300_000)
})
