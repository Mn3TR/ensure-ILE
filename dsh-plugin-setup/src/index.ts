/**
 * First-run conversation for ensure-ILE.
 *
 * One preset (`setup`), one job: ask a learner's grade, timetable, rhythm and
 * solving preference, then say what happens next. Progress is field-level in
 * `<DSH_HOME>/setup.json`, so an interrupted onboarding resumes where it
 * stopped instead of starting over.
 * @module dsh-plugin-setup
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { composePrompt } from 'dsh-plugin-teaching-commons'
import { defaultStateFile, readState, updateState } from './state.ts'
// Type-only: resolves the required ctx.systemPrompt service declaration.
import type {} from '@deepseek-ai/dsh-system-prompt'

export type { OnboardingState, SetupFacts, SetupPatch, SetupState } from './state.ts'
export { defaultStateFile, ONBOARDING_STATES, readState, updateState } from './state.ts'

/** Cordis plugin name. */
export const name = 'plugin-setup'

/** Services used by this row. */
export const inject = ['systemPrompt', 'tools']

/** Runtime schema for the setup row. */
export const Config = z.object({
  /** Absolute path to the setup document; empty means the packaged copy. */
  promptFile: z.string().default(''),
  /** Absolute path to the progress file; empty means `<DSH_HOME>/setup.json`. */
  stateFile: z.string().default(''),
})

/** Resolved configuration shape. */
export interface Config {
  promptFile?: string
  stateFile?: string
}

/** The system-prompt section the setup conversation occupies. */
export const SETUP_SECTION = 'setup'

const DEFAULT_PROMPT_FILE = fileURLToPath(new URL('../prompts/setup.md', import.meta.url))
const FACT_KEYS = ['grade', 'schedule', 'rhythm', 'preference'] as const

/**
 * Mount the setup conversation and its two tools on this scope.
 * @param ctx - an agent scope context; the preset mounts this row per session.
 * @param config - where the document and the progress file live.
 */
export function apply(ctx: Context, config: Config): void {
  const promptFile = config.promptFile !== undefined && config.promptFile.length > 0
    ? config.promptFile
    : DEFAULT_PROMPT_FILE
  const stateFile = config.stateFile !== undefined && config.stateFile.length > 0
    ? config.stateFile
    : defaultStateFile()

  ctx.effect(() => ctx.systemPrompt.section({
    name: SETUP_SECTION,
    order: 0,
    text: composePrompt(['common'], readFileSync(promptFile, 'utf8')),
    complete: true,
  }), 'setup.section()')

  // Onboarding is a conversation with one teenager, not a shell session: date and
  // cwd are noise, and the harness adds a required cwd snapshot that must be
  // shadowed rather than suppressed.
  ctx.systemPrompt.suppressRuntimeContext()
  ctx.effect(() => ctx.systemPrompt.context({
    name: 'working-directory:current',
    order: ctx.systemPrompt.getContextOrder('WORKING_DIRECTORY'),
    required: true,
    interpolate: false,
    text: '',
  }), 'setup.hideCwdContext()')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'setup_read',
    description: '读开学进度：已经问了哪些、还差哪些。开新会话时先读，填过的不重问。',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async () => JSON.stringify(readState(stateFile), null, 2),
  })), 'setup.read()')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'setup_update',
    description: [
      '写开学进度。字段：onboarding（pending / done）、grade、schedule、rhythm、preference、next。',
      '问到一样就写一样；没问到的别传，传了的字段会覆盖。',
      '收尾：能说出「下一步做什么」时才写 onboarding=done 并把那句话放进 next——不是四样问齐。',
    ].join('\n'),
    parameters: {
      onboarding: { type: 'string', description: 'pending / done' },
      grade: { type: 'string', description: '年级与班级' },
      schedule: { type: 'string', description: '周几上课、晚自习、周末' },
      rhythm: { type: 'string', description: '几点到家、什么时候写作业' },
      preference: { type: 'string', description: '解题偏好：先想还是先动笔、几何代数哪边怵' },
      next: { type: 'string', description: '下一步做什么（收尾时必须写）' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async (args) => {
      const state = updateState(stateFile, {
        ...(args.onboarding === undefined ? {} : { onboarding: args.onboarding }),
        ...(args.grade === undefined ? {} : { grade: args.grade }),
        ...(args.schedule === undefined ? {} : { schedule: args.schedule }),
        ...(args.rhythm === undefined ? {} : { rhythm: args.rhythm }),
        ...(args.preference === undefined ? {} : { preference: args.preference }),
        ...(args.next === undefined ? {} : { next: args.next }),
      })
      const filled = FACT_KEYS.filter(key => state.got[key] !== undefined)
      return '已记：' + (filled.length === 0 ? '（还没有）' : filled.join('、'))
        + '；状态 ' + state.onboarding
        + (state.next === undefined ? '' : '；下一步：' + state.next)
    },
  })), 'setup.update()')
}