/**
 * Work mode for ensure-ILE.
 *
 * One row, two jobs: replace the system prompt with the shared teaching
 * fragments plus the work document, and expose `read_note` so the model can
 * judge against the per-subject criteria. The learner never sees the notes —
 * they are judging material, not teaching material.
 * @module dsh-plugin-work
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
export const name = 'plugin-work'

/** Services used by this row. */
export const inject = ['systemPrompt', 'tools']

/** Runtime schema for the work row. */
export const Config = z.object({
  /** Absolute path to the work document; empty means the packaged copy. */
  promptFile: z.string().default(''),
})

/** Resolved configuration shape. */
export interface Config {
  promptFile?: string
}

/** The system-prompt section work mode occupies. */
export const WORK_SECTION = 'work'

const DEFAULT_PROMPT_FILE = fileURLToPath(new URL('../prompts/work.md', import.meta.url))

/**
 * Mount work mode and its note reader on this scope.
 * @param ctx - an agent scope context; the preset mounts this row per session.
 * @param config - where the work document lives.
 */
export function apply(ctx: Context, config: Config): void {
  const file = config.promptFile !== undefined && config.promptFile.length > 0
    ? config.promptFile
    : DEFAULT_PROMPT_FILE
  const text = composePrompt(['common', 'bank'], readFileSync(file, 'utf8'))

  ctx.effect(() => ctx.systemPrompt.section({
    name: WORK_SECTION,
    order: 0,
    text,
    complete: true,
  }), 'work.section()')

  ctx.systemPrompt.suppressRuntimeContext()
  ctx.effect(() => ctx.systemPrompt.context({
    name: 'working-directory:current',
    order: ctx.systemPrompt.getContextOrder('WORKING_DIRECTORY'),
    required: true,
    interpolate: false,
    text: '',
  }), 'work.hideCwdContext()')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'read_note',
    description: '读取一个科目的判卷标准。判卷前按题目科目调用一次；这是判卷用的，不要念给学生。',
    parameters: {
      note: { type: 'string', required: true, description: '科目备注名：math（理科）或 arts（文科）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => readNote(args.note),
  })), 'work.readNote()')
}
