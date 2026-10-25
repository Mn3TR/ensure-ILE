import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

const roots: string[] = []
function bank(): string {
  const root = mkdtempSync(join(tmpdir(), 'ensure-ile-bank-tools-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function toolsFor(directory: string) {
  const tools: { name: string; execute: (args: Record<string, unknown>, exec: unknown) => Promise<string> }[] = []
  apply({ tools: { register: (tool: unknown) => tools.push(tool as never) } } as never, { directory })
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