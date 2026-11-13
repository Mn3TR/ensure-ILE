import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 本地假 DeepSeek 端点：桌面壳真正会打的协议是 Anthropic Messages，不是
 * OpenAI 的 `/chat/completions`（`llm-deepseek` 走 `POST <base>/v1/messages`，
 * SSE 帧按 `event.type` 校验、以 `message_stop` 收尾；文件在 `<base>/v1/files`；
 * 模型目录来自配置而不是发现请求）。这个服务答那套协议、把每个模型请求原样落盘，
 * 并保留一条 `/chat/completions` 支路，免得哪天换成 OpenAI 形状的客户端时整轮跑不完。
 *
 * 两种用法：
 *  1. 不排脚本：每个对话请求都回 {@link FAKE_REPLY_TEXT}，等于「模型一直在说话」。
 *  2. 排脚本（{@link FakeDeepSeek.script}）：预设接下来 N 个响应为 tool_use 或失败，
 *     用来断言工具回路、历史折叠、以及重试链路。
 *
 * **队列只被「对话请求」消费**：一轮会发两个模型请求（对话 + AI 标题生成），
 * 标题请求不带 `tools`，所以挑请求一律按 `tools` 非空筛，别假设 requests[0]
 * 就是对话（历史坑：取 requests[0] 会拿到标题请求，脚本被它吃掉一条）。
 */

/** 假助手默认说的话，够特别，UI 上可以直接等它出现。 */
export const FAKE_REPLY_TEXT = '先说说你卡在哪一步：是题意没读明白，还是不知道从哪下手？（fake-deepseek）'

/**
 * 一次「对话请求」的脚本化响应：
 * - `text`：正常回一段文本，`text` 省略时用 {@link FAKE_REPLY_TEXT}；
 * - `tool_use`：回一个工具调用（`name` + `input`），由 Host 真去执行它；
 * - `failure`：直接回 HTTP 错误（429 → RATE_LIMIT、5xx → SERVER，两者都在
 *   默认可重试码里），用来验证重试链路。
 */
export type FakeReply =
  | { readonly kind: 'text'; readonly text?: string }
  | { readonly kind: 'tool_use'; readonly name: string; readonly input: Record<string, unknown> }
  | {
    readonly kind: 'failure'
    readonly status: number
    /** 错误体里的 message，默认一句话说明是假服务发的。 */
    readonly message?: string
    /**
     * `Retry-After` 秒数。**一般别填**：上游把 > maxDelayMs（默认 10 s）的它当
     * 「等不起」直接放弃重试，而不给这个头才走 500 ms 起步的指数退避。
     */
    readonly retryAfterSeconds?: number
  }

export interface FakeDeepSeek {
  /** Base URL to hand the child process as `DEEPSEEK_BASE_URL`. */
  url: string
  port: number
  /** Bodies of the model requests, in arrival order. */
  requests: Record<string, unknown>[]
  /** Request headers parallel to `requests` — the credential and beta opt-ins live here. */
  headers: IncomingMessage['headers'][]
  /** Files API calls, kept out of the model-request ordering. */
  fileRequests: { method: string; path: string }[]
  /** Directory holding `request-001.json` and onward. */
  dumpDir: string
  /**
   * 排队接下来的对话响应，先进先出；队列空了就回默认文本。
   * 只对带 `tools` 的请求生效（见文件头）。
   */
  script(replies: readonly FakeReply[]): void
  /** 每个对话请求实际拿到的那条响应（含队列空后的默认文本），按到达顺序——数重试就看它。 */
  served: FakeReply[]
  close(): Promise<void>
}

/** One complete Messages stream: text block, then a settled turn. */
function messageEvents(model: string, text: string): Record<string, unknown>[] {
  return [
    { type: 'message_start', message: { id: 'msg_fake_text', model, usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
    { type: 'message_stop' },
  ]
}

/**
 * 一个工具调用回合。`input` 必须先是对象（适配器按对象读它），随后整段 JSON 走
 * `input_json_delta` 覆盖上去；`stop_reason` 要是 `tool_use`，否则 Host 不认。
 */
function toolUseEvents(
  model: string,
  id: string,
  name: string,
  input: Record<string, unknown>,
): Record<string, unknown>[] {
  return [
    { type: 'message_start', message: { id: 'msg_fake_tool', model, usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id, name, input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 8 } },
    { type: 'message_stop' },
  ]
}

/** `event:` and `data:` lines both name the type, matching the real endpoint and `src/sse.ts`. */
function sseBody(events: Record<string, unknown>[]): string {
  return events.map(event => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`).join('')
}

/** Read a whole request body as text. */
async function readBody(request: IncomingMessage): Promise<string> {
  const parts: Buffer[] = []
  for await (const part of request as AsyncIterable<Buffer>) parts.push(part)
  return Buffer.concat(parts).toString('utf8')
}

/** 请求是不是「对话」那一发：只有它带工具表，标题生成请求的 tools 是空的。 */
function carriesTools(body: Record<string, unknown>): boolean {
  return Array.isArray(body.tools) && body.tools.length > 0
}

/**
 * Start the fake endpoint on an OS-assigned port.
 * @param dumpDir - directory receiving `request-NNN.json`, one file per model request.
 * @returns the endpoint's URL, recorded requests, the reply queue, and teardown.
 */
export async function startFakeDeepSeek(dumpDir: string): Promise<FakeDeepSeek> {
  mkdirSync(dumpDir, { recursive: true })
  const requests: Record<string, unknown>[] = []
  const headers: IncomingMessage['headers'][] = []
  const fileRequests: FakeDeepSeek['fileRequests'] = []
  const queue: FakeReply[] = []
  const served: FakeReply[] = []

  const server: Server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => response.destroy(error as Error))
  })

  /** 下一个对话请求的响应：先取队列，队列空了回默认文本。 */
  function nextReply(): FakeReply {
    return queue.shift() ?? { kind: 'text' }
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const path = url.pathname
    if (request.method === 'POST' && path.endsWith('/files')) {
      // The image path only has to exist: no 404 means the client keeps its file id.
      fileRequests.push({ method: 'POST', path })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        id: 'file-fake-1', type: 'file', size_bytes: 8, created_at: new Date().toISOString(),
        filename: 'upload.png', mime_type: 'image/png',
      }))
      return
    }
    if (request.method === 'GET' && path.endsWith('/files')) {
      fileRequests.push({ method: 'GET', path })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: [], first_id: null, last_id: null, has_more: false }))
      return
    }
    if (request.method === 'GET' && path.endsWith('/models')) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        data: [
          { id: 'deepseek-flash', type: 'model', display_name: 'DeepSeek-V4.1-Flash' },
          { id: 'deepseek-v4-pro', type: 'model', display_name: 'DeepSeek-V4-Pro' },
        ],
        has_more: false,
      }))
      return
    }
    if (request.method !== 'POST') {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'not found' } }))
      return
    }

    const raw = await readBody(request)
    let body: Record<string, unknown> = {}
    try {
      body = JSON.parse(raw) as Record<string, unknown>
    } catch (_nonJsonRequest) {
      // A non-JSON body still records the raw text so a human can see what arrived.
      body = { unparsed: raw }
    }
    const index = requests.length + 1
    requests.push(body)
    headers.push(request.headers)
    writeFileSync(join(dumpDir, `request-${String(index).padStart(3, '0')}.json`),
      JSON.stringify(body, null, 2) + '\n')

    if (path.endsWith('/chat/completions')) {
      // OpenAI-shaped fallback: content chunk, finish, [DONE]. Never scripted — the
      // shell does not use this arm.
      const id = 'chatcmpl-fake'
      const model = typeof body.model === 'string' ? body.model : 'deepseek-flash'
      const frames = [
        { id, object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] },
        { id, object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: { content: FAKE_REPLY_TEXT } }] },
        { id, object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      ]
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const frame of frames) response.write(`data: ${JSON.stringify(frame)}\n\n`)
      response.end('data: [DONE]\n\n')
      return
    }

    const model = typeof body.model === 'string' ? body.model : 'deepseek-flash'
    // 标题请求不排队、不记账：它只证明壳还会顺手起标题，不代表对话那一轮。
    if (!carriesTools(body)) {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end(sseBody(messageEvents(model, FAKE_REPLY_TEXT)))
      return
    }

    const reply = nextReply()
    served.push(reply)

    if (reply.kind === 'failure') {
      const type = reply.status === 429
        ? 'rate_limit_error'
        : reply.status >= 500 ? 'api_error' : 'invalid_request_error'
      const message = reply.message ?? `fake-deepseek: 故意返回 HTTP ${String(reply.status)}`
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (reply.retryAfterSeconds !== undefined) headers['retry-after'] = String(reply.retryAfterSeconds)
      response.writeHead(reply.status, headers)
      response.end(JSON.stringify({ type: 'error', error: { type, message } }))
      return
    }

    response.writeHead(200, { 'content-type': 'text/event-stream' })
    if (reply.kind === 'tool_use') {
      const id = `toolu_fake_${String(served.length)}`
      response.end(sseBody(toolUseEvents(model, id, reply.name, reply.input)))
      return
    }
    response.end(sseBody(messageEvents(model, reply.text ?? FAKE_REPLY_TEXT)))
  }

  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fake-deepseek: no loopback port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    requests,
    headers,
    fileRequests,
    dumpDir,
    served,
    script(replies) {
      queue.push(...replies)
    },
    async close() {
      const closed = new Promise<void>((resolve, reject) => {
        server.close(error => { if (error === null || error === undefined) resolve(); else reject(error) })
      })
      server.closeAllConnections()
      await closed
    },
  }
}
