/**
 * HRL guide persona for DHDL.
 *
 * One row, two jobs: replace the agent's system prompt with the guide document,
 * and expose `read_note` so the guide can pull the per-subject notes it tells
 * itself to read. The document is read from disk at mount time so editing
 * `prompts/guide.md` needs no rebuild.
 * @module dsh-plugin-hrll
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
// Type-only: resolves the required ctx.systemPrompt service declaration.
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Cordis plugin name. */
export const name = 'plugin-hrll-guide'

/** Services used by this row. */
export const inject = ['systemPrompt', 'tools']

/** Runtime schema for the guide row. */
export const Config = z.object({
  /** Absolute path to the guide document; empty means the packaged copy. */
  promptFile: z.string().default(''),
})

/** Resolved configuration shape. */
export interface Config {
  promptFile?: string
}

/** The system-prompt section the guide occupies. */
export const GUIDE_SECTION = 'hrll:guide'

const DEFAULT_PROMPT_FILE = fileURLToPath(new URL('../prompts/guide.md', import.meta.url))
const NOTES_DIR = fileURLToPath(new URL('../skills/', import.meta.url))

/**
 * Read one subject note, or explain which names exist.
 * @param note - subject key supplied by the model.
 * @returns the note body, or a model-facing error sentence.
 */
function readNote(note: string): string {
  const key = note.trim().toLowerCase()
  if (!/^[a-z]+$/.test(key)) return `备注名只能是小写字母：收到的是 ${JSON.stringify(note)}。`
  const file = join(NOTES_DIR, `${key}.md`)
  if (!existsSync(file)) {
    const available = ['math', 'arts'].filter((candidate) => existsSync(join(NOTES_DIR, `${candidate}.md`)))
    return `没有 ${key} 这个科目的备注。可用的有：${available.join('、')}。`
  }
  return readFileSync(file, 'utf8')
}

/**
 * Mount the guide persona and its note reader on this scope.
 * @param ctx - an agent scope context; the preset mounts this row per session.
 * @param config - where the guide document lives.
 */
export function apply(ctx: Context, config: Config): void {
  const file = config.promptFile !== undefined && config.promptFile.length > 0
    ? config.promptFile
    : DEFAULT_PROMPT_FILE
  const text = readFileSync(file, 'utf8')

  ctx.effect(() => ctx.systemPrompt.section({
    name: GUIDE_SECTION,
    order: 0,
    text,
    complete: true,
  }), 'hrll.guide()')

  // The guide speaks to one learner about one problem; date and cwd are noise.
  ctx.systemPrompt.suppressRuntimeContext()

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'read_note',
    description: '读取一个科目的引导备注。开始引导前，按题目科目调用一次。',
    parameters: {
      note: { type: 'string', required: true, description: '科目备注名：math（理科）或 arts（文科）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => readNote(args.note),
  })), 'hrll.readNote()')
}
