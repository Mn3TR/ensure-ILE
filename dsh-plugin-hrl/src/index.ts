/**
 * Answer optimization for ensure-ILE.
 *
 * One row: replace the system prompt with the shared fragments plus the HRL
 * document, and expose `read_note` so "站得住" is judged by the subject's own
 * criteria rather than a general impression.
 * @module dsh-plugin-hrl
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
export const name = 'plugin-hrl'

/** Services used by this row. */
export const inject = ['systemPrompt', 'tools']

/** Runtime schema for the HRL row. */
export const Config = z.object({
  /** Absolute path to the HRL document; empty means the packaged copy. */
  promptFile: z.string().default(''),
})

/** Resolved configuration shape. */
export interface Config {
  promptFile?: string
}

/** The system-prompt section answer optimization occupies. */
export const HRL_SECTION = 'hrl'

const DEFAULT_PROMPT_FILE = fileURLToPath(new URL('../prompts/hrl.md', import.meta.url))

/**
 * Mount answer optimization and its note reader on this scope.
 * @param ctx - an agent scope context; the preset mounts this row per session.
 * @param config - where the HRL document lives.
 */
export function apply(ctx: Context, config: Config): void {
  const file = config.promptFile !== undefined && config.promptFile.length > 0
    ? config.promptFile
    : DEFAULT_PROMPT_FILE
  const text = composePrompt(['common', 'bank'], readFileSync(file, 'utf8'))

  ctx.effect(() => ctx.systemPrompt.section({
    name: HRL_SECTION,
    order: 0,
    text,
    complete: true,
  }), 'hrl.section()')

  ctx.systemPrompt.suppressRuntimeContext()
  ctx.effect(() => ctx.systemPrompt.context({
    name: 'working-directory:current',
    order: ctx.systemPrompt.getContextOrder('WORKING_DIRECTORY'),
    required: true,
    interpolate: false,
    text: '',
  }), 'hrl.hideCwdContext()')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'read_note',
    description: '读取一个科目的评价标准。写教师轨迹、判断他的答案站不站得住之前，按科目调用一次。',
    parameters: {
      note: { type: 'string', required: true, description: '科目备注名：math（理科）或 arts（文科）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => readNote(args.note),
  })), 'hrl.readNote()')
}
