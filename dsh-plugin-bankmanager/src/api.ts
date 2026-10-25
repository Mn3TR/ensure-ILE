/**
 * 浏览器半边的数据通道：`/bank/api`。
 *
 * 客户端只认两个动作——列出待接的交接、把一道交接标成已被某个会话接走。
 * 走的是 host 插件注册 HTTP 前缀路由、浏览器侧 `fetch`，与 `dsh-plugin-memory`
 * 的面板同一条路（独立包生成不了 Typert 的 remote 产物）。信任围栏同 `/api`
 * 网关：只认 loopback / `trustedHosts`，拒绝 cross-site。
 *
 * 路由缺席时插件照常工作（工具才是主体）：headless profile 没有 `webServer`，
 * 那时只有卡片画不出来，模型侧一个字节都不少。
 */
import type { Context } from '@deepseek-ai/cordis'
import { BankError, listProblems, pendingHandoffs, updateProblem } from './store.ts'

/** Body size bound of one JSON request. */
const MAX_BODY_BYTES = 1 << 16

/** Route prefix owned by this plugin. */
const ROUTE_PREFIX = '/bank/api'

class BankApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message)
    this.name = 'BankApiError'
  }
}

interface HttpResponse {
  writeHead(status: number, headers: Record<string, string>): void
  end(data: string): void
}

interface HttpRequest {
  headers: Record<string, string | string[] | undefined>
  method?: string
  url?: string
  [Symbol.asyncIterator](): AsyncIterator<string | Uint8Array>
}

interface WebServerService {
  register(route: {
    kind: 'prefix'
    path: string
    handler: (req: unknown, res: unknown) => Promise<void> | void
  }): () => void
}

interface WebStartupService {
  readonly trustedHosts: readonly string[]
}

function writeJson(res: HttpResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function writeError(res: HttpResponse, error: unknown): void {
  if (error instanceof BankApiError) {
    writeJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } })
    return
  }
  if (error instanceof BankError) {
    writeJson(res, 400, { ok: false, error: { code: error.code, message: error.message } })
    return
  }
  writeJson(res, 500, {
    ok: false,
    error: { code: 'internal', message: error instanceof Error ? error.message : String(error) },
  })
}

async function readJsonBody(req: AsyncIterable<string | Uint8Array>): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw new BankApiError('bad-request', 'request body too large')
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new BankApiError('bad-request', 'request body is not valid JSON')
  }
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL('http://' + authority)
  } catch {
    return undefined
  }
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/u.test(part) && Number(part) <= 255)
}

/**
 * Whether one request may reach the plugin routes.
 * @param request - inbound request headers.
 * @param trustedHosts - hosts the Host already trusts for its own API.
 * @returns true for loopback or trusted authority, same-origin only.
 */
function isTrusted(request: HttpRequest, trustedHosts: readonly string[]): boolean {
  const host = header(request.headers, 'host')
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  const trusted = isLoopbackHostname(hostUrl.hostname)
    || trustedHosts.some((entry) => {
      const entryUrl = parseAuthority(entry)
      return entryUrl !== undefined && entryUrl.host === hostUrl.host
    })
  if (!trusted) return false
  if (header(request.headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = header(request.headers, 'origin')
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/**
 * Every problem whose handoff nobody accepted yet, newest first.
 * @param directory - bank directory.
 * @returns the card-shaped pending rows.
 */
function pendingRows(directory: string): { id: string, subject: string, status: string, statement: string, handoff: unknown }[] {
  const { records } = listProblems(directory)
  const rows: { id: string, subject: string, status: string, statement: string, handoff: unknown }[] = []
  for (const entry of pendingHandoffs(records)) {
    const record = records.find(candidate => candidate.id === entry.id)
    if (record === undefined) continue
    rows.push({
      id: record.id,
      subject: record.subject,
      status: record.status,
      statement: record.statement,
      handoff: entry.handoff,
    })
  }
  return rows
}

/** One API method. */
type BankApiMethod = (payload: Record<string, unknown>) => Promise<unknown> | unknown

/**
 * Mount the browser data channel.
 * @param ctx - profile-root context.
 * @param directory - bank directory the client reads and writes through this route.
 */
export function mountBankApi(ctx: Context, directory: string): void {
  const host = ctx as unknown as {
    get?: (name: string) => unknown
    effect?: (fn: () => () => void, label: string) => unknown
  }
  // 直接调 apply 的测试与 headless profile 都没有这两个服务：安静退回，工具照旧。
  if (typeof host.get !== 'function' || typeof host.effect !== 'function') return
  const webServer = host.get('webServer') as WebServerService | undefined
  const webStartup = host.get('webStartup') as WebStartupService | undefined
  if (webServer === undefined || webStartup === undefined) return

  const api: Record<string, BankApiMethod> = {
    'handoff.pending': () => pendingRows(directory),
    'handoff.consume': async (payload) => {
      const id = typeof payload.id === 'string' ? payload.id : ''
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : ''
      if (id === '') throw new BankApiError('bad-request', 'missing or invalid "id"')
      if (sessionId === '') throw new BankApiError('bad-request', 'missing or invalid "sessionId"')
      const record = await updateProblem(directory, id, { handoffConsume: sessionId })
      return {
        id: record.id,
        consumedAt: record.handoff?.consumedAt ?? null,
        consumerSessionId: record.handoff?.consumerSessionId ?? null,
      }
    },
  }

  const fence = (req: HttpRequest): boolean => isTrusted(req, webStartup.trustedHosts)

  host.effect(() => webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (rawReq, rawRes) => {
      const req = rawReq as HttpRequest
      const res = rawRes as HttpResponse
      if (!fence(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
        return
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } })
        return
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith(ROUTE_PREFIX + '/') ? pathname.slice(ROUTE_PREFIX.length + 1) : undefined
      if (method === undefined || method.includes('/')) {
        writeError(res, new BankApiError('not-found', 'unknown bank API method', 404))
        return
      }
      try {
        const payload = await readJsonBody(req)
        const handler = api[method]
        if (handler === undefined) throw new BankApiError('not-found', 'unknown bank API method "' + method + '"', 404)
        const record = (payload ?? {}) as Record<string, unknown>
        writeJson(res, 200, { ok: true, value: await handler(record) })
      } catch (error) {
        writeError(res, error)
      }
    },
  }), 'dsh-plugin-bankmanager: /bank/api routes')
}
