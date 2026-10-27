import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/', import.meta.url))

interface FakeTool {
  name: string
  execute: (args: Record<string, unknown>, exec: unknown) => Promise<string>
}

function toolsFor(dataDirectory: string) {
  const registered: FakeTool[] = []
  apply(
    { tools: { register: (tool: unknown) => registered.push(tool as FakeTool) } } as never,
    { dataDirectory },
  )
  return () => registered
}

const exec = { signal: new AbortController().signal }

function call(dataDirectory: string, name: string, args: Record<string, unknown> = {}) {
  const registered = toolsFor(dataDirectory)()
  const tool = registered.find(candidate => candidate.name === name)
  if (tool === undefined) throw new Error('missing tool ' + name)
  return tool.execute(args, exec)
}

describe('textbook tools', () => {
  it('registers exactly the three read-only hands', () => {
    expect(toolsFor(FIXTURE)().map(tool => tool.name)).toEqual([
      'textbook_books',
      'textbook_find',
      'textbook_read',
    ])
  })

  it('lists every book with its text availability', async () => {
    const listed = await call(FIXTURE, 'textbook_books')
    const lines = listed.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('fx-text｜测试·有文字层｜math｜12 页｜有文字层｜5 节')
    expect(lines[1]).toContain('扫描件')
  })

  it('finds a section and shows both page numbers', async () => {
    const found = await call(FIXTURE, 'textbook_find', { query: '集合的概念' })
    expect(found).toContain('fx-text｜测试·有文字层｜1.1 集合的概念｜PDF p4-5（课本 p1-2）｜节')
  })

  it('says what it knows when a query misses', async () => {
    const found = await call(FIXTURE, 'textbook_find', { query: '正弦定理' })
    expect(found).toContain('没找到')
    expect(found).toContain('fx-text')
  })

  it('reads a page range with markers', async () => {
    const read = await call(FIXTURE, 'textbook_read', { book: 'fx-text', from: 4, to: 6 })
    expect(read).toContain('PDF p4-6（课本 p1-3）')
    expect(read).toContain('[p4] 1.1 集合的概念')
    expect(read).toContain('[p6] 1.2 集合间的关系')
  })

  it('reads by section name when it is unique', async () => {
    const read = await call(FIXTURE, 'textbook_read', { book: 'fx-text', from: 1, section: '1.1 集合的概念' })
    expect(read).toContain('1.1 集合的概念 PDF p4-5')
    expect(read).toContain('[p4]')
    expect(read).not.toContain('[p1]')
  })

  it('asks for a narrower section when the name matches several', async () => {
    const read = await call(FIXTURE, 'textbook_read', { book: 'fx-text', from: 1, section: '集合' })
    expect(read).toContain('对得上 3 节')
    expect(read).toContain('1.1 集合的概念')
  })

  it('tells the model to hand over page numbers for a scan, without failing', async () => {
    const read = await call(FIXTURE, 'textbook_read', { book: 'fx-scan', from: 1, section: '1.1 质点 参考系' })
    expect(read).toContain('没有文字层')
    expect(read).toContain('测试·扫描件')
    expect(read).toContain('1.1 质点 参考系')
    expect(read).toContain('把页码告诉学生')
    expect(read).not.toContain('textbook error')
  })

  it('points at the next page when the range is longer than one answer', async () => {
    const read = await call(FIXTURE, 'textbook_read', { book: 'fx-text', from: 1 })
    expect(read).toMatch(/…还有 \d+ 页，用 from=\d+ 接着读/u)
  })

  it('turns a store failure into one sentence', async () => {
    const read = await call(FIXTURE, 'textbook_read', { book: 'nope-1', from: 1 })
    expect(read.startsWith('textbook error: ')).toBe(true)
    expect(read).toContain('fx-text')
  })

  it('reports a missing corpus instead of throwing', async () => {
    const listed = await call(FIXTURE + 'nowhere/', 'textbook_books')
    expect(listed.startsWith('textbook error: ')).toBe(true)
    expect(listed).toContain('index.json')
  })
})
