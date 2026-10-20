import { expect, it, vi } from 'vitest'
import type { BundleInfo } from '@deepseek-ai/dsh-api-remotes/client'
import {
  BUILT_IN_MARKET_SOURCES,
  configureSingleMarketToOfficial,
  DSH_MARKET,
  importMarketSourcesToOfficial,
  marketToggleTargets,
  OFFICIAL_CONFIGURABLE_MARKET_SOURCES,
  OFFICIAL_MARKET,
  orderedMarketSourceUrls,
  prefetchMarketIndexes,
  removeMarketSourcesFromOfficial,
  resolveActiveMarketSource,
  toggleMarketEndpointInOfficial,
} from '../src/client/market-toggle.ts'

const CHINA_SYNC = 'https://cdn.jsdelivr.net/gh/realguan/dsh-plugin-market@dist/dsh-index.json'
const GLOBAL_SYNC = 'https://realguan.github.io/dsh-plugin-market/dsh-index.json'
const CUSTOM_SYNC = 'https://custom.example.com/index.json'

const row = (name: string, enabled: boolean, readOnlyReason?: string) =>
  ({ name, enabled, readOnlyReason }) as BundleInfo

it('enables the only built-in market and disables whichever copy is active', () => {
  expect(marketToggleTargets([row(DSH_MARKET, false)], true)).toEqual([DSH_MARKET])
  expect(marketToggleTargets([row(DSH_MARKET, false, 'locked')], true)).toEqual([])
  expect(marketToggleTargets([row(DSH_MARKET, true), row('unrelated-bundle', true)], false)).toEqual([DSH_MARKET])
  expect(marketToggleTargets([row(DSH_MARKET, false)], false)).toEqual([])
  expect(marketToggleTargets([row(DSH_MARKET, true, 'locked')], false)).toEqual([])
})

it('declares only the official-format dshmarket provider while keeping it configurable', () => {
  expect(BUILT_IN_MARKET_SOURCES.map(item => item.key)).toEqual(['dshmarket'])
  expect(OFFICIAL_CONFIGURABLE_MARKET_SOURCES.map(item => item.key)).toEqual(['dshmarket'])
  expect(BUILT_IN_MARKET_SOURCES.flatMap(item => item.sources.map(source => source.url))).toEqual([
    CHINA_SYNC,
    GLOBAL_SYNC,
  ])
})

it('resolves the dshmarket source for the configured region', () => {
  expect(resolveActiveMarketSource([row(DSH_MARKET, true)])).toEqual({
    enabled: true,
    bundle: DSH_MARKET,
    marketKey: 'dshmarket',
    desktopActiveUrl: 'https://mirrors.cloud.tencent.com/npm/dsh-plugin-catalog/latest',
    syncUrl: CHINA_SYNC,
    region: 'china',
  })
  expect(resolveActiveMarketSource([row(DSH_MARKET, true)], { dshMarketRegion: 'global' })).toEqual({
    enabled: true,
    bundle: DSH_MARKET,
    marketKey: 'dshmarket',
    desktopActiveUrl: 'https://awesome-dsh-plugin.com/plugins.json',
    syncUrl: GLOBAL_SYNC,
    region: 'global',
  })
  expect(resolveActiveMarketSource([row(DSH_MARKET, false)])).toEqual({
    enabled: false,
    bundle: null,
    marketKey: 'dshmarket',
    desktopActiveUrl: null,
    syncUrl: CHINA_SYNC,
    region: 'china',
  })
})

it('quick configuration enables the official custom plugin market, configures the dshmarket default source first, and preloads all configured sources', async () => {
  const setBundleEnabled = vi.fn(async () => ({ ok: true as const, value: { application: 'applied' } }))
  const listIndexes = vi.fn(async () => ({
    ok: true as const,
    value: [{ url: CUSTOM_SYNC }],
  }))
  const setIndexes = vi.fn(async () => ({ ok: true as const, value: undefined }))
  const search = vi.fn(async (url: string) => ({ ok: true as const, value: { url, title: 'Loaded' } }))
  const resolution = resolveActiveMarketSource([row(DSH_MARKET, false)])

  const result = await importMarketSourcesToOfficial(
    { pluginManager: { setBundleEnabled }, pluginMarket: { listIndexes, setIndexes, search } },
    resolution,
    false,
  )

  expect(setBundleEnabled).toHaveBeenCalledWith(OFFICIAL_MARKET, true)
  expect(setIndexes).toHaveBeenCalledTimes(2)
  expect(setIndexes).toHaveBeenNthCalledWith(1, [CHINA_SYNC])
  expect(result.syncedUrl).toBe(CHINA_SYNC)
  expect(result.configuredUrls).toEqual([CHINA_SYNC, CUSTOM_SYNC])
  expect(result.configuredUrls).toEqual(orderedMarketSourceUrls(resolution, [CUSTOM_SYNC]))
  expect(search).toHaveBeenCalledTimes(2)
  for (const url of result.configuredUrls) {
    expect(search).toHaveBeenCalledWith(url, { sort: { kind: 'index' }, offset: 0, limit: 1 })
  }
})

it('configures and unconfigures the single built-in market and individual sub-source endpoints', async () => {
  const setBundleEnabled = vi.fn(async () => ({ ok: true as const, value: { application: 'applied' } }))
  const listIndexes = vi.fn(async () => ({
    ok: true as const,
    value: [{ url: CUSTOM_SYNC }],
  }))
  const setIndexes = vi.fn(async () => ({ ok: true as const, value: undefined }))
  const search = vi.fn(async () => ({ ok: true as const, value: {} }))

  const result = await configureSingleMarketToOfficial(
    { pluginManager: { setBundleEnabled }, pluginMarket: { listIndexes, setIndexes, search } },
    'dshmarket',
    { dshMarketRegion: 'global' },
    true,
  )

  expect(setBundleEnabled).not.toHaveBeenCalled()
  expect(setIndexes).toHaveBeenNthCalledWith(1, [GLOBAL_SYNC])
  expect(result.syncedUrl).toBe(GLOBAL_SYNC)
  expect(result.configuredUrls).toEqual([GLOBAL_SYNC, CHINA_SYNC, CUSTOM_SYNC])
  expect(search).toHaveBeenCalledTimes(3)

  listIndexes.mockResolvedValueOnce({
    ok: true as const,
    value: [{ url: GLOBAL_SYNC }, { url: CHINA_SYNC }, { url: CUSTOM_SYNC }],
  })
  const afterRemove = await removeMarketSourcesFromOfficial(
    { pluginManager: { setBundleEnabled }, pluginMarket: { listIndexes, setIndexes, search } },
    'dshmarket',
  )
  expect(afterRemove).toEqual([CUSTOM_SYNC])

  listIndexes.mockResolvedValueOnce({
    ok: true as const,
    value: [{ url: CUSTOM_SYNC }],
  })
  const endpoint = 'https://another.example.com/index.json'
  const toggledOn = await toggleMarketEndpointInOfficial(
    { pluginManager: { setBundleEnabled }, pluginMarket: { listIndexes, setIndexes, search } },
    endpoint,
    true,
    true,
  )
  expect(toggledOn.configuredUrls).toEqual([endpoint, CUSTOM_SYNC])

  listIndexes.mockResolvedValueOnce({
    ok: true as const,
    value: [{ url: endpoint }, { url: CUSTOM_SYNC }],
  })
  const toggledOff = await toggleMarketEndpointInOfficial(
    { pluginManager: { setBundleEnabled }, pluginMarket: { listIndexes, setIndexes, search } },
    endpoint,
    false,
    true,
  )
  expect(toggledOff.configuredUrls).toEqual([CUSTOM_SYNC])
})

it('preloads configured index URLs on explicit configuration actions and bounds slow endpoints by timeout', async () => {
  const search = vi.fn().mockResolvedValue({ ok: true })
  await prefetchMarketIndexes(
    {
      listIndexes: async () => ({ ok: true, value: [] }),
      setIndexes: async () => ({ ok: true, value: undefined }),
      search,
    },
    [CHINA_SYNC, GLOBAL_SYNC],
    0,
  )
  expect(search).toHaveBeenCalledTimes(2)
  expect(search).toHaveBeenCalledWith(CHINA_SYNC, {
    sort: { kind: 'index' },
    offset: 0,
    limit: 1,
  })

  await prefetchMarketIndexes(
    {
      listIndexes: async () => ({ ok: true, value: [] }),
      setIndexes: async () => ({ ok: true, value: undefined }),
      search: async () => new Promise(() => {}),
    },
    ['https://slow.example.com/index.json'],
    10,
  )
})
