import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { mountBankApi } from '../src/api.ts'
import { createProblem, updateProblem } from '../src/store.ts'

const roots: string[] = []
function bank(): string {
  const root = mkdtempSync(join(tmpdir(), 'ensure-ile-bank-api-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

type Handler = (req: unknown, res: unknown) => Promise<void>

/** 只给 mountBankApi 需要的两个服务和一个 effect，路由处理器抓出来直接调。 */
function harness(directory: string, options: { events?: unknown[], lastTurn?: number, mode?: string, preset?: string } = {}): { call: (method: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number, body: unknown }> } {
  let handler: Handler | undefined
  const mode = options.mode ?? ''
  const session = Session.create(SessionId('session-1'))
  let collected = 0
  const ctx = {
    get(name: string) {
      if (name === 'webServer') {
        return {
          register: (route: { kind: string, path: string, handler: Handler }) => {
            handler = route.handler
            return () => {}
          },
        }
      }
      if (name === 'webStartup') return { trustedHosts: [] }
      if (name === 'sessions') return { get: (id: string) => id === 'missing' ? undefined : session }
      if (name === 'sessionProjections') return {
        stateOf(_session: unknown, key: string) {
          if (key === 'turnBoundary') return { lastTurn: options.lastTurn ?? 0, openTurnStartSeq: null }
          if (key === 'agentPreset') return options.preset ?? 'work'
          if (key === 'ile') return { mode }
          return undefined
        },
      }
      return undefined
    },
    effect(fn: () => () => void) { return fn() },
  }
  mountBankApi(ctx as never, directory)
  return {
    async call(method, body = {}, headers = { host: '127.0.0.1:43120', 'content-type': 'application/json' }) {
      if (handler === undefined) throw new Error('route not registered')
      const text = JSON.stringify(body)
      const req = {
        headers,
        method: 'POST',
        url: '/bank/api/' + method,
        async *[Symbol.asyncIterator]() { yield text },
      }
      let status = 0
      let payload: unknown
      const res = {
        writeHead(code: number) { status = code },
        end(data: string) { payload = JSON.parse(data) },
      }
      await handler(req, res)
      const events = session.snapshotEvents()
      options.events?.push(...events.slice(collected).map(({ type, data }) => ({ type, data })))
      collected = events.length
      return { status, body: payload }
    },
  }
}

describe('bank api route', () => {
  it('lists a pending handoff and consumes it for a session', async () => {
    const directory = bank()
    const problem = await createProblem(directory, { statement: '求值域', subject: 'math' })
    await updateProblem(directory, problem.id, {
      handoff: { from: 'work', to: 'guide', why: '讲不清', state: '第二步' },
    })
    const route = harness(directory)

    const pending = await route.call('handoff.pending')
    expect(pending.status).toBe(200)
    const rows = (pending.body as { value: { id: string, statement: string, handoff: { to: string } }[] }).value
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(problem.id)
    expect(rows[0]?.statement).toBe('求值域')
    expect(rows[0]?.handoff.to).toBe('guide')

    const consumed = await route.call('handoff.consume', { id: problem.id, sessionId: 'session-1' })
    expect(consumed.status).toBe(200)
    expect((consumed.body as { value: { consumerSessionId: string } }).value.consumerSessionId).toBe('session-1')

    const after = await route.call('handoff.pending')
    expect((after.body as { value: unknown[] }).value).toHaveLength(0)
  })

  it.each(['guide', 'work', 'hrl', '答案优化'])('initializes the actual %s mode before consuming the handoff', async to => {
    const directory = bank()
    const problem = await createProblem(directory, { statement: '求值域', subject: 'math' })
    await updateProblem(directory, problem.id, { handoff: { from: 'work', to, why: '换一种做法', state: '第二步' } })
    const events: unknown[] = []
    const route = harness(directory, { events })
    expect((await route.call('handoff.consume', { id: problem.id, sessionId: 'session-1' })).status).toBe(200)
    expect(events).toEqual([{ type: 'plugin:ile/mode', data: { mode: to === '答案优化' ? 'hrl' : to, summary: '第二步' } }])
    await route.call('handoff.consume', { id: problem.id, sessionId: 'session-1' })
    expect(events).toHaveLength(1)
  })

  it('keeps an existing session mode and refuses to consume for a missing session', async () => {
    const directory = bank()
    const problem = await createProblem(directory, { statement: '求值域', subject: 'math' })
    await updateProblem(directory, problem.id, { handoff: { from: 'work', to: 'hrl', why: '优化', state: '第二步' } })
    const events: unknown[] = []
    const route = harness(directory, { events, lastTurn: 2, mode: 'guide' })
    expect((await route.call('handoff.consume', { id: problem.id, sessionId: 'missing' })).status).toBe(409)
    expect((await route.call('handoff.pending')).body).toMatchObject({ value: [{ id: problem.id }] })
    expect((await route.call('handoff.consume', { id: problem.id, sessionId: 'existing' })).status).toBe(200)
    expect(events).toEqual([])
  })

  it('refuses a consume without a session and an unknown method', async () => {
    const directory = bank()
    const problem = await createProblem(directory, { statement: '配平', subject: 'chemistry' })
    await updateProblem(directory, problem.id, {
      handoff: { from: 'work', to: 'hrl', why: '要打磨', state: '第一步' },
    })
    const route = harness(directory)
    const missing = await route.call('handoff.consume', { id: problem.id })
    expect(missing.status).toBe(400)
    const unknown = await route.call('handoff.nope')
    expect(unknown.status).toBe(404)
  })

  it('rejects a request from a foreign host', async () => {
    const route = harness(bank())
    const refused = await route.call('handoff.pending', {}, { host: 'evil.example:80' })
    expect(refused.status).toBe(403)
  })
})
