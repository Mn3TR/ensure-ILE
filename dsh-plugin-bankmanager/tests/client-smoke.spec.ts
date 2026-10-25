import { describe, expect, it, vi } from 'vitest'

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

interface StyleElement { dataset: Record<string, string>; textContent: string; removed: boolean; remove(): void }

/** 只提供 installHandoffStyles 用到的两个 DOM 成员，不引 jsdom。 */
function stubDocument(styles: StyleElement[]): void {
  const documentStub = {
    createElement: () => {
      const element: StyleElement = { dataset: {}, textContent: '', removed: false, remove() { element.removed = true } }
      styles.push(element)
      return element
    },
    head: { appendChild: () => {} },
  }
  Object.assign(globalThis, { document: documentStub })
}

const { apply } = await import('../src/client/index.ts')

interface Registration {
  name: string
  key?: string
  id?: string
  order?: number
  inject?: () => Record<string, unknown>
  component: unknown
}

function fakeContext(registrations: Registration[]) {
  return {
    effect(fn: () => (() => void) | void) { return fn() },
    get() { return undefined },
    slots: {
      inject(_name: string, factory: () => unknown) { return factory() },
      register(options: Omit<Registration, 'component'>, component: unknown) {
        registrations.push({ ...options, component })
        return () => {}
      },
    },
  }
}

describe('bank client half', () => {
  it('claims the bank_resume card and the hero resume entry, and injects its styles', () => {
    const styles: StyleElement[] = []
    stubDocument(styles)
    const registrations: Registration[] = []
    apply(fakeContext(registrations))
    expect(registrations).toHaveLength(2)

    const card = registrations.find(entry => entry.name === 'tool.call.toolview')
    expect(card).toMatchObject({ name: 'tool.call.toolview', key: 'bank_resume' })
    expect(typeof card?.component).toBe('function')
    expect(typeof card?.inject?.().resume).toBe('function')

    const hero = registrations.find(entry => entry.name === 'conversation.hero.options')
    expect(hero).toMatchObject({ name: 'conversation.hero.options', id: 'ile-resume', order: 20 })
    expect(typeof hero?.component).toBe('function')
    const injected = hero?.inject?.() ?? {}
    expect(typeof injected.loadPending).toBe('function')
    expect(typeof injected.consume).toBe('function')

    expect(styles).toHaveLength(1)
    expect(styles[0]?.dataset.ileHandoffStyles).toBe('')
    expect(styles[0]?.textContent).toContain('.ile-handoff__statement')
    expect(styles[0]?.textContent).toContain('.ile-resume__chip')
  })
})
