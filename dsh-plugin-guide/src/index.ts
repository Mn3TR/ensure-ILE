/**
 * Guide persona for ensure-ILE.
 *
 * One row, two jobs: replace the agent's system prompt with the shared teaching
 * fragments plus the guide document, and expose `read_note` so the guide can
 * pull the per-subject notes it tells itself to read. Both are read from disk at
 * mount time, so editing them needs no rebuild.
 * @module dsh-plugin-guide
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { composePrompt, readNote } from 'dsh-plugin-teaching-commons'
// Type-only: resolves the required ctx.systemPrompt service declaration.
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Cordis plugin name. */
export const name = 'plugin-guide'

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
export const GUIDE_SECTION = 'guide'

const DEFAULT_PROMPT_FILE = fileURLToPath(new URL('../prompts/guide.md', import.meta.url))

/**
 * Mount the guide persona and its note reader on this scope.
 * @param ctx - an agent scope context; the preset mounts this row per session.
 * @param config - where the guide document lives.
 */
export function apply(ctx: Context, config: Config): void {
  const file = config.promptFile !== undefined && config.promptFile.length > 0
    ? config.promptFile
    : DEFAULT_PROMPT_FILE
  // Safety, voice and bank usage are shared by every mode; guide.md is its own part.
  const text = composePrompt(['common', 'bank'], readFileSync(file, 'utf8'))

  ctx.effect(() => ctx.systemPrompt.section({
    name: GUIDE_SECTION,
    order: 0,
    text,
    complete: true,
  }), 'guide.section()')

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
  })), 'guide.readNote()')
}
