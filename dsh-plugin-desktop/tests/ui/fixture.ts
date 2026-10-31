import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright-core'

/** `dsh-plugin-desktop/` — where `lib/main.js` and `node_modules/electron` live. */
export const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
/** The repository root, whose packages the development profile links to. */
const repoRoot = join(packageRoot, '..')
const electronBinary = createRequire(import.meta.url)('electron') as unknown as string

/** A data root whose profile resolves the same way the repository template does. */
export function createRoot(): string {
  const dataRoot = mkdtempSync(join(tmpdir(), 'dsh-ui-'))
  const profileDir = join(dataRoot, 'home', 'profiles', 'desktop')
  mkdirSync(profileDir, { recursive: true })
  const template = join(repoRoot, 'profiles', 'ensure-ile')
  for (const file of ['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml']) {
    const source = join(template, file)
    if (existsSync(source)) writeFileSync(join(profileDir, file), readFileSync(source))
  }
  const manifest = JSON.parse(readFileSync(join(template, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    // Same resolution the vendored profile gets: our packages at the repository
    // root, vendored third-party source under vendor/. A junction keeps the test
    // data root disposable without reinstalling anything.
    const base = basename(name)
    const target = [join(repoRoot, base), join(repoRoot, 'vendor', base)]
      .find(candidate => existsSync(join(candidate, 'package.json')))
    if (target === undefined) throw new Error('fixture: cannot resolve profile dependency ' + name)
    const link = join(profileDir, 'node_modules', name)
    mkdirSync(join(link, '..'), { recursive: true })
    symlinkSync(target, link, 'junction')
  }
  // The launch decides the Profile is a legacy install unless pnpm's own state
  // says otherwise (`src/profile.ts` profileDependencyMigrationRequired), and a
  // development launch has no packaged pnpm to migrate with, so it would stop at
  // the recovery window. Our Profile only links local packages, so record the
  // state a hoisted install would have left behind.
  writeFileSync(join(profileDir, 'node_modules', '.modules.yaml'),
    'nodeLinker: hoisted\npackageManager: pnpm@11.8.0\nvirtualStoreDirMaxLength: 60\n')
  writeFileSync(join(profileDir, 'pnpm-lock.yaml'),
    "lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: false\n")
  return dataRoot
}

export interface Shell {
  app: ElectronApplication
  page: Page
  dataRoot: string
  /** Text of the running window, for failure messages. */
  text(): Promise<string>
  close(): Promise<void>
}

/**
 * Launch the desktop app against `dataRoot`. Every home-ish variable is pinned
 * so an inherited `DSH_HOME` (an agent shell usually has one) can never point
 * the test at somebody's real installation.
 */
export interface LaunchOptions {
  /** `'full'` enters the seven-screen upstream wizard instead of our single screen. */
  setup?: string
}

export async function launchShell(dataRoot: string, options: LaunchOptions = {}): Promise<Shell> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ENSURE_ILE_SETUP
  if (options.setup !== undefined) env.ENSURE_ILE_SETUP = options.setup
  Object.assign(env, {
    ENSURE_ILE_DATA_ROOT: dataRoot,
    DSH_HOME: join(dataRoot, 'home'),
    ENSURE_ILE_HOME: join(dataRoot, 'home'),
    DSH_AGENTS_HOME: join(dataRoot, 'agents'),
    DSH_DESKTOP_USER_DATA: join(dataRoot, 'appdata'),
  })
  const app = await electron.launch({
    executablePath: electronBinary,
    args: [join(packageRoot, 'lib', 'main.js')],
    cwd: packageRoot,
    env,
  })
  const page = await app.firstWindow()
  return {
    app,
    page,
    dataRoot,
    async text() {
      return await page.evaluate(() => document.body.innerText).catch(() => '')
    },
    async close() {
      await app.close().catch(() => {})
    },
  }
}

/** The page that hosts the Web client, skipping the native recovery/setup windows. */
export async function clientPage(app: ElectronApplication, timeout = 180_000): Promise<Page> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const window of app.windows()) {
      let url = ''
      try {
        url = window.url()
      } catch {
        continue
      }
      if (url.includes('127.0.0.1') || url.includes('localhost')) return window
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('fixture: the Web client never opened; windows: ' +
    app.windows().map(w => { try { return w.url() } catch { return 'closed' } }).join(' | '))
}

export function removeRoot(dataRoot: string): void {
  rmSync(dataRoot, { recursive: true, force: true, maxRetries: 5 })
}

/**
 * Launch reaches the desktop setup screen first. Skipping it asks for confirmation
 * ("跳过设置？"), and only then does the conversation screen take over.
 */
export async function skipDesktopSetup(page: Page, timeout = 120_000): Promise<void> {
  const skip = page.getByRole('button', { name: '跳过', exact: true })
  const confirm = page.getByRole('button', { name: '跳过设置', exact: true })
  const composer = page.locator('[data-dsh-claude-part~="composer-stack"]').first()
  if (await skip.count() > 0) {
    await skip.first().click()
    await confirm.first().click({ timeout })
  }
  // The overlay stays mounted (and swallows clicks) until the Host acknowledges the
  // skip, so wait for it to leave the document rather than for what is behind it.
  await page.locator('[data-desktop-onboarding-surface]').first()
    .waitFor({ state: 'detached', timeout })
    .catch(() => {})
  await expectVisible(composer, timeout)
}

/**
 * Playwright's own `expect` matchers need `@playwright/test`; these two are the
 * whole vocabulary our assertions use, built on locator waits instead.
 */
export async function expectVisible(locator: Locator, timeout = 30_000): Promise<void> {
  try {
    await locator.first().waitFor({ state: 'visible', timeout })
  } catch (cause) {
    throw new Error('expected element to be visible: ' + locator + ' — ' + (cause instanceof Error ? cause.message.split('\n')[0] : String(cause)))
  }
}

export async function expectHidden(locator: Locator, timeout = 30_000): Promise<void> {
  try {
    await locator.first().waitFor({ state: 'hidden', timeout })
  } catch (cause) {
    throw new Error('expected element to be hidden: ' + locator + ' — ' + (cause instanceof Error ? cause.message.split('\n')[0] : String(cause)))
  }
}
