/**
 * Guide mode persona for ensure-ILE.
 *
 * No section, no tool and no cwd shadow of its own any more: the core
 * (`dsh-plugin-coreset`) owns the one `complete` section, `read_note` and the
 * shadow, because a preset that mounts three personas may only have one of each.
 * This row contributes nothing but its mode text.
 *
 * @module dsh-plugin-guide
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { composePrompt } from 'dsh-plugin-teaching-commons'
// Type-only: resolves the required ctx.ileModes service declaration.
import type {} from 'dsh-plugin-coreset'

/** Cordis plugin name. */
export const name = 'plugin-guide'

/** The core's mode registry is the only service this row needs. */
export const inject = ['ileModes']

/** Runtime schema for the row. */
export const Config = z.object({
  /** Absolute path to the persona document; empty means the packaged copy. */
  promptFile: z.string().default(''),
})

/** Resolved configuration shape. */
export interface Config {
  promptFile?: string
}

/** Mode id `context_switch` accepts. */
export const GUIDE_MODE = 'guide'

const MODE_NAME = '引导模式'
const DEFAULT_PROMPT_FILE = fileURLToPath(new URL('../prompts/guide.md', import.meta.url))

/**
 * Register this mode's persona text with the core.
 * @param ctx - an agent scope context; a preset mounts this row per session.
 * @param config - where the persona document lives.
 */
export function apply(ctx: Context, config: Config): void {
  const file = config.promptFile !== undefined && config.promptFile.length > 0
    ? config.promptFile
    : DEFAULT_PROMPT_FILE
  // Safety, voice and bank usage are shared by every study mode; the persona
  // document is this mode's own part.
  const text = composePrompt(['common', 'bank'], readFileSync(file, 'utf8'))

  ctx.effect(
    () => ctx.ileModes.registerMode({ id: GUIDE_MODE, name: MODE_NAME, text, switchable: true }),
    'guide.mode()',
  )
}
