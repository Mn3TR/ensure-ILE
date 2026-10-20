/** Map the Plugins-page switch and source configuration to official bundle-manager and plugin-market operations. */
import type { BundleInfo, MarketIndexSummary, RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'

export const DSH_MARKET = 'dshmarket'
export const OFFICIAL_MARKET = '@deepseek-ai/dsh-experimental-plugin-market-bundle'
export type MarketName = typeof DSH_MARKET
export type BuiltInMarketKey = 'dshmarket'

type MarketState = Pick<BundleInfo, 'name' | 'enabled' | 'readOnlyReason' | 'error'>

export interface BilingualText {
  readonly zh: string
  readonly en: string
}

export interface MarketSourceEndpoint {
  readonly url: string
  readonly label: BilingualText
  readonly tags: readonly BilingualText[]
  /** Whether this endpoint serves an official DSH format-1 index document. */
  readonly format1?: boolean
  /** Region this endpoint is tailored for when the market has regional mirrors. */
  readonly region?: 'global' | 'china'
}

export interface BuiltInMarketDefinition {
  readonly key: BuiltInMarketKey
  readonly bundle: MarketName
  readonly providerId?: string
  readonly title: BilingualText
  readonly description: BilingualText
  readonly homepage: string
  /** Primary index URL synced to the official custom plugin market by default. */
  readonly defaultSyncUrl: string
  readonly sources: readonly MarketSourceEndpoint[]
}

export const BUILT_IN_MARKET_SOURCES: readonly BuiltInMarketDefinition[] = [
  {
    key: 'dshmarket',
    bundle: DSH_MARKET,
    title: { zh: 'dsh-market（Awesome DSH Plugin）', en: 'dsh-market (Awesome DSH Plugin)' },
    description: {
      zh: '第三方插件市场，提供已适配自定义插件市场格式（format 1）的国内 CDN 与 GitHub Pages 索引源。',
      en: 'Third-party plugin market with China CDN and GitHub Pages index sources adapted for the custom plugin market format (format 1).',
    },
    homepage: 'https://awesome-dsh-plugin.com',
    defaultSyncUrl: 'https://cdn.jsdelivr.net/gh/realguan/dsh-plugin-market@dist/dsh-index.json',
    sources: [
      {
        url: 'https://cdn.jsdelivr.net/gh/realguan/dsh-plugin-market@dist/dsh-index.json',
        label: { zh: 'dsh-market 索引源（jsDelivr CDN 国内加速）', en: 'dsh-market index source (jsDelivr CDN China mirror)' },
        tags: [
          { zh: '国内推荐', en: 'China CDN' },
          { zh: 'format 1', en: 'format 1' },
        ],
        format1: true,
        region: 'china',
      },
      {
        url: 'https://realguan.github.io/dsh-plugin-market/dsh-index.json',
        label: { zh: 'dsh-market 索引源（GitHub Pages 国际源）', en: 'dsh-market index source (GitHub Pages Global)' },
        tags: [
          { zh: '国际源 Global', en: 'Global' },
          { zh: 'format 1', en: 'format 1' },
        ],
        format1: true,
        region: 'global',
      },
    ],
  },
]

/**
 * Built-in markets currently displayed and configurable for the official "Custom Plugin Market"
 * (`@deepseek-ai/dsh-experimental-plugin-market-bundle`).
 * Only `dshmarket` currently publishes `format: 1` `dsh-index.json` endpoints.
 */
export const OFFICIAL_CONFIGURABLE_MARKET_SOURCES: readonly BuiltInMarketDefinition[] =
  BUILT_IN_MARKET_SOURCES.filter(item => item.key === 'dshmarket')

export interface MarketRuntimeState {
  readonly dshMarketRegion?: 'global' | 'china' | undefined
}

export interface ActiveMarketResolution {
  readonly enabled: boolean
  readonly bundle: MarketName | null
  readonly marketKey: BuiltInMarketKey
  /** URL currently used by the Desktop market plugin itself, when enabled. */
  readonly desktopActiveUrl: string | null
  /** URL synced as the active/first index in the official custom plugin market. */
  readonly syncUrl: string
  readonly region?: 'global' | 'china'
}

const DSH_MARKET_DESKTOP_ACTIVE_URLS: Readonly<Record<'global' | 'china', string>> = {
  global: 'https://awesome-dsh-plugin.com/plugins.json',
  china: 'https://mirrors.cloud.tencent.com/npm/dsh-plugin-catalog/latest',
}

const DSH_MARKET_SYNC_URLS: Readonly<Record<'global' | 'china', string>> = {
  global: 'https://realguan.github.io/dsh-plugin-market/dsh-index.json',
  china: 'https://cdn.jsdelivr.net/gh/realguan/dsh-plugin-market@dist/dsh-index.json',
}

function editable(row: MarketState): boolean {
  return row.readOnlyReason === undefined && row.error === undefined
}

/** Enabling selects the dsh-market bundle; disabling clears every editable selected market row. */
export function marketToggleTargets(rows: readonly MarketState[], enable: boolean): MarketName[] {
  const markets = rows.filter((row): row is MarketState & { name: MarketName } => row.name === DSH_MARKET)
  if (!enable) {
    const active = markets.filter(row => row.enabled)
    return active.every(editable) ? active.map(row => row.name) : []
  }
  return markets.filter(row => editable(row)).map(row => row.name)
}

/** Resolve the dsh-market plugin state and the source endpoints it currently uses. */
export function resolveActiveMarketSource(
  rows: readonly MarketState[],
  runtime: MarketRuntimeState = {},
): ActiveMarketResolution {
  const enabledBundle: MarketName | null =
    rows.find(row => row.name === DSH_MARKET)?.enabled === true ? DSH_MARKET : null
  const region = runtime.dshMarketRegion ?? 'china'
  return {
    enabled: enabledBundle !== null,
    bundle: enabledBundle,
    marketKey: 'dshmarket',
    desktopActiveUrl: enabledBundle ? DSH_MARKET_DESKTOP_ACTIVE_URLS[region] : null,
    syncUrl: DSH_MARKET_SYNC_URLS[region],
    region,
  }
}

function deduplicateUrls(candidates: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of candidates) {
    const trimmed = raw.trim()
    if (!trimmed || !URL.canParse(trimmed)) continue
    const key = new URL(trimmed).href
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

/**
 * Build the deduplicated list of default index URLs for "Quick configuration" (`pluginMarket.setIndexes`),
 * placing the default source of `dshmarket` (or the active `dshmarket` sync URL) first, followed by any existing user URLs.
 */
export function orderedMarketSourceUrls(
  resolution: Pick<ActiveMarketResolution, 'marketKey' | 'syncUrl' | 'desktopActiveUrl'>,
  existingUrls: readonly string[] = [],
): string[] {
  const defaultUrls = OFFICIAL_CONFIGURABLE_MARKET_SOURCES.map(item =>
    item.key === resolution.marketKey ? resolution.syncUrl : item.defaultSyncUrl)
  return deduplicateUrls([
    ...defaultUrls,
    ...existingUrls,
  ])
}

export interface OfficialMarketImportClient {
  readonly pluginManager: {
    setBundleEnabled(
      name: string,
      enabled: boolean,
    ): Promise<RemoteResult<{ readonly application: string; readonly error?: { readonly diagnostic?: string } }>>
  }
  readonly pluginMarket: {
    listIndexes(): Promise<RemoteResult<MarketIndexSummary[]>>
    setIndexes(urls: string[]): Promise<RemoteResult<void>>
    search?(
      url: string,
      query: { readonly sort: { readonly kind: 'index' }; readonly offset: number; readonly limit: number },
    ): Promise<unknown>
  }
}

export interface OfficialMarketImportResult {
  readonly application: string
  readonly syncedUrl: string
  readonly configuredUrls: readonly string[]
}

const PREFETCH_WAIT_TIMEOUT_MS = 2500

/**
 * Preload configured market index URLs into the Host `PluginMarket` cache so their titles
 * are immediately available in the Discover source dropdown without selecting each source first.
 */
export async function prefetchMarketIndexes(
  pluginMarket: OfficialMarketImportClient['pluginMarket'],
  urls: readonly string[],
  timeoutMs: number = PREFETCH_WAIT_TIMEOUT_MS,
): Promise<void> {
  if (typeof pluginMarket.search !== 'function' || urls.length === 0) return
  const preloadAll = Promise.allSettled(
    urls.map(url => pluginMarket.search!(url, { sort: { kind: 'index' }, offset: 0, limit: 1 })),
  )
  if (timeoutMs <= 0) {
    await preloadAll
    return
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      preloadAll,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function applyOfficialIndexes(
  remote: OfficialMarketImportClient,
  syncedUrl: string,
  configuredUrls: string[],
  existingUrls: readonly string[],
  officialBundleEnabled: boolean,
): Promise<OfficialMarketImportResult> {
  let application = 'applied'
  if (!officialBundleEnabled) {
    const enableResult = await remote.pluginManager.setBundleEnabled(OFFICIAL_MARKET, true)
    if (!enableResult.ok) throw new Error(enableResult.error.message)
    application = enableResult.value.application
    if (application === 'failed' || application === 'cancelled') {
      throw new Error(enableResult.value.error?.diagnostic ?? 'Could not enable the official custom plugin market.')
    }
  }
  // Selecting `[syncedUrl]` first forces DiscoverController to drop any previously selected URL before the full list is saved.
  if (existingUrls.length > 0 && existingUrls[0] !== syncedUrl) {
    const primeResult = await remote.pluginMarket.setIndexes([syncedUrl])
    if (!primeResult.ok) throw new Error(primeResult.error.message)
  }
  const saveResult = await remote.pluginMarket.setIndexes(configuredUrls)
  if (!saveResult.ok) throw new Error(saveResult.error.message)
  await prefetchMarketIndexes(remote.pluginMarket, configuredUrls)
  return {
    application,
    syncedUrl,
    configuredUrls,
  }
}

/**
 * Quick-configure the built-in plugin market (`dshmarket`) default source into the official
 * custom plugin market bundle (`@deepseek-ai/dsh-experimental-plugin-market-bundle`), synchronizing it as the selected index.
 */
export async function importMarketSourcesToOfficial(
  remote: OfficialMarketImportClient,
  resolution: Pick<ActiveMarketResolution, 'marketKey' | 'syncUrl' | 'desktopActiveUrl'>,
  officialBundleEnabled: boolean,
): Promise<OfficialMarketImportResult> {
  const existingResult = await remote.pluginMarket.listIndexes()
  const existingUrls = existingResult.ok ? existingResult.value.map(item => item.url) : []
  const configuredUrls = orderedMarketSourceUrls(resolution, existingUrls)
  return await applyOfficialIndexes(remote, resolution.syncUrl, configuredUrls, existingUrls, officialBundleEnabled)
}

/**
 * Enable the official custom plugin market bundle (`@deepseek-ai/dsh-experimental-plugin-market-bundle`),
 * configure all sources of a single built-in market, and select its default source as the active index.
 */
export async function configureSingleMarketToOfficial(
  remote: OfficialMarketImportClient,
  marketKey: BuiltInMarketKey,
  runtime: MarketRuntimeState,
  officialBundleEnabled: boolean,
): Promise<OfficialMarketImportResult> {
  const target = resolveActiveMarketSource([], runtime)
  const marketDef = BUILT_IN_MARKET_SOURCES.find(item => item.key === marketKey)
  const marketUrls = marketDef ? marketDef.sources.map(source => source.url) : []
  const existingResult = await remote.pluginMarket.listIndexes()
  const existingUrls = existingResult.ok ? existingResult.value.map(item => item.url) : []
  const configuredUrls = deduplicateUrls([
    target.syncUrl,
    ...marketUrls,
    ...existingUrls,
  ])
  return await applyOfficialIndexes(remote, target.syncUrl, configuredUrls, existingUrls, officialBundleEnabled)
}

/**
 * Remove all configured sources belonging to a single built-in market from the official custom plugin market.
 */
export async function removeMarketSourcesFromOfficial(
  remote: OfficialMarketImportClient,
  marketKey: BuiltInMarketKey,
): Promise<readonly string[]> {
  const marketDef = BUILT_IN_MARKET_SOURCES.find(item => item.key === marketKey)
  const urlsToRemove = new Set(marketDef ? marketDef.sources.map(source => source.url) : [])
  const existingResult = await remote.pluginMarket.listIndexes()
  const existingUrls = existingResult.ok ? existingResult.value.map(item => item.url) : []
  const remainingUrls = existingUrls.filter(url => !urlsToRemove.has(url))
  const saveResult = await remote.pluginMarket.setIndexes(remainingUrls)
  if (!saveResult.ok) throw new Error(saveResult.error.message)
  return remainingUrls
}

/**
 * Configure or unconfigure a specific sub-source endpoint URL in the official custom plugin market.
 */
export async function toggleMarketEndpointInOfficial(
  remote: OfficialMarketImportClient,
  endpointUrl: string,
  enable: boolean,
  officialBundleEnabled: boolean,
): Promise<OfficialMarketImportResult> {
  const existingResult = await remote.pluginMarket.listIndexes()
  const existingUrls = existingResult.ok ? existingResult.value.map(item => item.url) : []
  if (!enable) {
    const remainingUrls = existingUrls.filter(url => url !== endpointUrl)
    const saveResult = await remote.pluginMarket.setIndexes(remainingUrls)
    if (!saveResult.ok) throw new Error(saveResult.error.message)
    return {
      application: 'applied',
      syncedUrl: remainingUrls[0] ?? '',
      configuredUrls: remainingUrls,
    }
  }
  const configuredUrls = deduplicateUrls([
    endpointUrl,
    ...existingUrls,
  ])
  return await applyOfficialIndexes(remote, endpointUrl, configuredUrls, existingUrls, officialBundleEnabled)
}
