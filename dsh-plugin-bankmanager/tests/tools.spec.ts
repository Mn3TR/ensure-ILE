import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'
import { problemDir, readProblem } from '../src/store.ts'

const roots: string[] = []
function bank(): string {
  const root = mkdtempSync(join(tmpdir(), 'ensure-ile-bank-tools-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Stored bytes keyed by the fake ref id, so two refs can carry different pictures. */
function toolsFor(directory: string, bytes: Record<string, Uint8Array> = {}) {
  const tools: { name: string; execute: (args: Record<string, unknown>, exec: unknown) => Promise<string> }[] = []
  const attachments = {
    readImage: async (ref: { attachmentId: string }) => {
      const data = bytes[ref.attachmentId]
      if (data === undefined) throw new Error('no bytes for ' + ref.attachmentId)
      return { data }
    },
    saveImage: async (input: { data: Uint8Array; mediaType: string }) => ({
      attachmentId: 'sha256:' + createHash('sha256').update(input.data).digest('hex'),
      mediaType: input.mediaType,
      bytes: input.data.byteLength,
      width: 2,
      height: 2,
    }),
  }
  const ctx = {
    tools: { register: (tool: unknown) => tools.push(tool as never) },
    logger: { info: () => {}, warn: () => {} },
    get: (service: string) => (service === 'attachments' ? attachments : undefined),
  }
  apply(ctx as never, { directory })
  return (name: string) => {
    const tool = tools.find(candidate => candidate.name === name)
    if (tool === undefined) throw new Error('missing tool ' + name)
    return tool
  }
}
const exec = { signal: new AbortController().signal }

describe('bank tools', () => {
  it('adds, lists, shows, updates and stats one problem', async () => {
    const dir = bank()
    const tool = toolsFor(dir)
    const added = await tool('bank_add').execute({ statement: '求导', subject: 'math', tags: ['导数'] }, exec)
    const id = /已建题：([a-z0-9-]+)/u.exec(added)?.[1]
    expect(id).toBeDefined()

    const listed = await tool('bank_list').execute({}, exec)
    expect(listed).toContain(id as string)
    expect(listed).toContain('new')

    const shown = await tool('bank_show').execute({ id }, exec)
    expect(JSON.parse(shown).statement).toBe('求导')

    const updated = await tool('bank_update').execute({ id, status: 'review', guideOutcome: 'solved' }, exec)
    expect(updated).toContain('review')

    const stats = await tool('bank_stats').execute({}, exec)
    expect(stats).toContain('总数：1')
    expect(stats).toContain('review=1')
  })


  it('resumes a pending handoff by listing it and by id', async () => {
    const dir = bank()
    const tool = toolsFor(dir)
    const added = await tool('bank_add').execute({ statement: '求导', subject: 'math' }, exec)
    const id = /已建题：([a-z0-9-]+)/u.exec(added)?.[1]
    await tool('bank_update').execute({ id, handoff: { from: 'work', to: 'guide', why: '讲不清', state: '第二步' } }, exec)
    const listed = await tool('bank_resume').execute({}, exec)
    expect(listed).toContain('work -> guide')
    const resumed = await tool('bank_resume').execute({ id }, exec)
    expect(JSON.parse(resumed).handoff.to).toBe('guide')
    expect(JSON.parse(resumed).statement).toBe('求导')
  })
  it('answers a missing problem instead of throwing', async () => {
    const tool = toolsFor(bank())
    const shown = await tool('bank_show').execute({ id: '20261024-math-abcdef' }, exec)
    expect(shown).toContain('not-found')
  })
})

describe('bank_list due filter', () => {
  it('只列今天到期该复习的题', async () => {
    const dir = bank()
    const tool = toolsFor(dir)
    const soon = await tool('bank_add').execute({ statement: '向量', subject: 'math' }, exec)
    const soonId = /已建题：([a-z0-9-]+)/u.exec(soon)?.[1]
    const later = await tool('bank_add').execute({ statement: '概率', subject: 'math' }, exec)
    const laterId = /已建题：([a-z0-9-]+)/u.exec(later)?.[1]
    const yesterday = new Date(Date.now() - 86_400_000).toISOString()
    const nextYear = new Date(Date.now() + 365 * 86_400_000).toISOString()
    await tool('bank_update').execute({ id: soonId, status: 'review', reviewNextAt: yesterday }, exec)
    await tool('bank_update').execute({ id: laterId, status: 'review', reviewNextAt: nextYear }, exec)

    const due = await tool('bank_list').execute({ due: true }, exec)
    expect(due).toContain(soonId as string)
    expect(due).not.toContain(laterId as string)
    expect(due).toContain('今天该复习 1 道')
  })
})

describe('pictures from the prompt', () => {
  const png = (seed: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, seed])
  function sessionWith(parts: { images?: string[]; text?: string }[], time = Date.now()) {
    const events = parts.map((part, index) => ({
      type: 'user/message',
      seq: index,
      time,
      data: {
        content: [
          ...(part.text === undefined ? [] : [{ type: 'text', text: part.text }]),
          ...(part.images ?? []).map(id => ({
            type: 'image',
            attachment: { attachmentId: id, mediaType: 'image/png', bytes: 5, width: 2, height: 2 },
          })),
        ],
      },
    }))
    return { surface: { nodes: events.map(event => event.seq) }, eventAt: (seq: number) => events[seq] }
  }

  it('copies the photo of the current message into the problem folder', async () => {
    const dir = bank()
    const tool = toolsFor(dir, { 'sha-a': png(1) })
    const exec = { signal: new AbortController().signal, agent: { session: sessionWith([{ images: ['sha-a'], text: '这题怎么做' }]) } }
    const added = await tool('bank_add').execute({ statement: '看图求值域', subject: 'math' }, exec)
    expect(added).toContain('图片：1 张已存进题目文件夹')
    const id = /已建题：([a-z0-9-]+)/u.exec(added)?.[1] as string
    const record = readProblem(dir, id)
    expect(record.attachments).toHaveLength(1)
    expect(record.attachments[0]?.mediaType).toBe('image/png')
    expect(existsSync(join(problemDir(dir, id), record.attachments[0]?.file as string))).toBe(true)
    expect(readdirSync(join(problemDir(dir, id), 'images'))).toHaveLength(1)
    expect(record.history.at(-1)?.event).toMatch(/^image /u)
  })
  it('finds a photo sent on its own one message earlier', async () => {
    const dir = bank()
    const tool = toolsFor(dir, { 'sha-b': png(2) })
    const exec = {
      signal: new AbortController().signal,
      agent: { session: sessionWith([{ images: ['sha-b'] }, { text: '这题怎么做' }]) },
    }
    const added = await tool('bank_add').execute({ statement: '看图', subject: 'math' }, exec)
    expect(added).toContain('图片：1 张')
  })
  it('ignores a photo from an older exchange', async () => {
    const dir = bank()
    const tool = toolsFor(dir, { 'sha-c': png(3) })
    const earlier = Date.now() - 60 * 60_000
    const exec = {
      signal: new AbortController().signal,
      agent: { session: sessionWith([{ images: ['sha-c'], text: '昨天的题' }], earlier) },
    }
    const added = await tool('bank_add').execute({ statement: '今天的题', subject: 'math' }, exec)
    expect(added).not.toContain('图片')
    const id = /已建题：([a-z0-9-]+)/u.exec(added)?.[1] as string
    expect(readProblem(dir, id).attachments).toEqual([])
  })
  it('stores the same bytes once', async () => {
    const dir = bank()
    const tool = toolsFor(dir, { 'sha-d': png(4) })
    const exec = {
      signal: new AbortController().signal,
      agent: { session: sessionWith([{ images: ['sha-d', 'sha-d'] }]) },
    }
    const added = await tool('bank_add').execute({ statement: '两张一样的图', subject: 'math' }, exec)
    expect(added).toContain('图片：1 张')
  })
  it('still creates the problem when no attachment store is mounted', async () => {
    const dir = bank()
    const tools: { name: string; execute: (args: Record<string, unknown>, exec: unknown) => Promise<string> }[] = []
    apply({
      tools: { register: (tool: unknown) => tools.push(tool as never) },
      logger: { info: () => {}, warn: () => {} },
      get: () => undefined,
    } as never, { directory: dir })
    const exec = { signal: new AbortController().signal, agent: { session: sessionWith([{ images: ['sha-e'] }]) } }
    const added = await tools[0]?.execute({ statement: '没有附件服务', subject: 'math' }, exec)
    expect(added).toContain('已建题')
    expect(added).not.toContain('图片')
  })
})

describe('bank_image', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9])
  function sessionWithPhoto() {
    return {
      surface: { nodes: [0] },
      eventAt: () => ({
        type: 'user/message',
        seq: 0,
        time: Date.now(),
        data: { content: [{ type: 'image', attachment: { attachmentId: 'sha-x', mediaType: 'image/png', bytes: 5, width: 2, height: 2 } }] },
      }),
    }
  }
  it('hands the stored picture back as an image block', async () => {
    const dir = bank()
    const tool = toolsFor(dir, { 'sha-x': png })
    const exec = { signal: new AbortController().signal, agent: { session: sessionWithPhoto() } }
    const added = await tool('bank_add').execute({ statement: '看图', subject: 'math' }, exec)
    const id = /已建题：([a-z0-9-]+)/u.exec(added)?.[1] as string
    const toolDef = tool('bank_image') as unknown as { execute: (a: unknown, e: unknown) => Promise<{ text: string; images: { attachmentId: string }[] }>; output: { render: (a: unknown, v: unknown) => { type: string }[] } }
    const value = await toolDef.execute({ id }, exec)
    expect(value.text).toContain('1 张')
    expect(value.images).toHaveLength(1)
    expect(value.images[0]?.attachmentId).toBe('sha256:' + createHash('sha256').update(png).digest('hex'))
    const blocks = toolDef.output.render({ id }, value)
    expect(blocks.map(block => block.type)).toEqual(['text', 'image'])
  })
  it('explains a problem without pictures and an out-of-range which', async () => {
    const dir = bank()
    const tool = toolsFor(dir, { 'sha-y': png, 'sha-x': new Uint8Array([7, 7, 7]) })
    const added = await tool('bank_add').execute({ statement: '纯文字题', subject: 'math' }, { signal: new AbortController().signal })
    const id = /已建题：([a-z0-9-]+)/u.exec(added)?.[1] as string
    const toolDef = tool('bank_image') as unknown as { execute: (a: unknown, e: unknown) => Promise<{ text: string; images: unknown[] }> }
    const empty = await toolDef.execute({ id }, { signal: new AbortController().signal })
    expect(empty.text).toContain('没有存图片')
    expect(empty.images).toEqual([])

    const exec = { signal: new AbortController().signal, agent: { session: sessionWithPhoto() } }
    const withPhoto = await tool('bank_add').execute({ statement: '带图', subject: 'math' }, exec)
    const photoId = /已建题：([a-z0-9-]+)/u.exec(withPhoto)?.[1] as string
    const outOfRange = await toolDef.execute({ id: photoId, which: 3 }, exec)
    expect(outOfRange.text).toContain('没有第 3 张')
  })
})
