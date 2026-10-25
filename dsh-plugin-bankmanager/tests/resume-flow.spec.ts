import { describe, expect, it, vi } from 'vitest'
import { readHandoffView } from '../src/client/handoff-model.ts'

vi.mock('react', () => ({
  useState: (init: unknown) => [typeof init === 'function' ? (init as () => unknown)() : init, () => {}],
  useEffect: () => {},
  useRef: (value: unknown) => ({ current: value }),
}))
vi.mock('react/jsx-runtime', () => ({
  jsx: (type: unknown, props: unknown) => ({ type, props }),
  jsxs: (type: unknown, props: unknown) => ({ type, props }),
  Fragment: Symbol('fragment'),
}))
vi.mock('react/jsx-dev-runtime', () => ({
  jsxDEV: (type: unknown, props: unknown) => ({ type, props }),
  Fragment: Symbol('fragment'),
}))

const { apply } = await import('../src/client/index.ts')

/** localStorage 与 fetch 的最小替身，够走完「接着做」一次。 */
interface Store { [key: string]: string }

function stubBrowser(store: Store, fetchImpl: unknown): void {
  Object.assign(globalThis, {
    window: {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value },
      },
      setTimeout: (fn: () => void) => { fn() },
    },
    fetch: fetchImpl,
    document: {
      createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
      head: { appendChild: () => {} },
    },
  })
}

const view = readHandoffView(JSON.stringify({
  id: '20261025-math-2d1ed2',
  statement: '求 f(x) 的值域',
  status: 'work',
  handoff: { id: 'hlt-1', from: 'guide', to: 'guide', why: '卡住', state: '第二步' },
}))!

interface Registration {
  name: string
  key?: string
  id?: string
  inject?: () => Record<string, unknown>
  component: unknown
}

interface HarnessOptions {
  store?: Store
  list?: Record<string, unknown>
  create?: (opts: { agentPreset?: string }) => Promise<string>
  consumeOk?: boolean
}

function harness(options: HarnessOptions) {
  const store = options.store ?? {}
  const calls = { create: [] as { agentPreset?: string }[], opened: [] as string[], drafts: [] as { prompt?: string }[], consumed: 0 }
  const fetchImpl = vi.fn(async (url: string) => {
    if (options.consumeOk !== false && String(url).includes('handoff.consume')) calls.consumed += 1
    if (options.consumeOk === false && String(url).includes('handoff.consume')) {
      return { ok: false, json: async () => ({ ok: false }) }
    }
    return { ok: true, json: async () => ({ ok: true, value: {} }) }
  })
  stubBrowser(store, fetchImpl)
  const registrations: Registration[] = []
  const ctx = {
    effect(fn: () => (() => void) | void) { return fn() },
    get(name: string) {
      if (name === 'sessions') {
        return {
          list: { getSnapshot: () => ({ byId: options.list ?? {} }) },
          create: async (opts: { agentPreset?: string }) => {
            calls.create.push(opts)
            return await (options.create ?? (async () => 'session-new'))(opts)
          },
          binding: () => ({ session: {} }),
        }
      }
      if (name === 'uiWorkspace') return { openSession: (id: string) => calls.opened.push(id) }
      if (name === 'conversation') {
        return {
          input: {
            requestDraftInitialization: (_binding: unknown, draft: { prompt?: string }) => {
              calls.drafts.push(draft)
              return 'applied'
            },
          },
        }
      }
      return undefined
    },
    slots: {
      inject(_name: string, factory: () => unknown) { return factory() },
      register(entry: Registration, component: unknown) {
        registrations.push({ ...entry, component })
        return () => {}
      },
    },
  }
  apply(ctx as never)
  const card = registrations.find(entry => entry.name === 'tool.call.toolview')
  if (card === undefined || card.inject === undefined) throw new Error('card not registered')
  const resume = card.inject().resume as (input: unknown) => Promise<string>
  return { calls, resume }
}

describe('bank resume flow', () => {
  it('opens a session under the handoff preset and fills the composer', async () => {
    const { calls, resume } = harness({})
    await expect(resume(view)).resolves.toBe('opened')
    expect(calls.create).toEqual([{ agentPreset: 'guide' }])
    expect(calls.opened).toEqual(['session-new'])
    expect(calls.drafts[0]?.prompt).toBe('接着上次那道题：20261025-math-2d1ed2（work）')
    expect(calls.consumed).toBe(1)
  })

  it('jumps back to the remembered session instead of creating another', async () => {
    const store: Store = { 'dsh-plugin-bankmanager:resume:20261025-math-2d1ed2': 'session-old' }
    const { calls, resume } = harness({ store, list: { 'session-old': {} } })
    await expect(resume(view)).resolves.toBe('opened')
    expect(calls.create).toEqual([])
    expect(calls.opened).toEqual(['session-old'])
  })

  it('reports a refused creation as failed', async () => {
    const { resume } = harness({ create: async () => { throw new Error('agent-preset/not-found') } })
    await expect(resume(view)).resolves.toBe('failed')
  })

  it('says so when the package could not be marked consumed', async () => {
    const { resume } = harness({ consumeOk: false })
    await expect(resume(view)).resolves.toBe('opened-unconsumed')
  })
})
