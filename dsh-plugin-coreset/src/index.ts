/**
 * ensure-ILE core: one `complete` prompt section, one mode registry, one
 * in-session switch.
 *
 * The four persona packages (guide / work / hrl / setup) stopped owning a
 * section, a tool and the cwd shadow of their own: exactly one `complete`
 * section may be active in a scope, so a session that mounts three personas
 * would throw. The core owns the section and reads the persona text of the mode
 * in force; the personas only `registerMode()` their text.
 *
 * A switch is the student's, not the model's alone: `context_switch` only
 * records an intent, and the next turn boundary folds everything the switch
 * replaces into one handoff notice. Tools never change — the catalog is the
 * same in every mode — so a switch costs the system prompt and nothing else.
 *
 * @module dsh-plugin-coreset
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { composePrompt, readNote } from 'dsh-plugin-teaching-commons'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { boundSummary, handoffNotice, replacementRange } from './handoff.ts'
import { CHAT_MODE, ILE_SECTION } from './types.ts'
import type { IleModeDefinition, IleModeEvent, IleUnitState } from './types.ts'

export { CHAT_MODE, ILE_SECTION } from './types.ts'
export type { IleModeDefinition, IleModeEvent, IleProjection, IleUnitState } from './types.ts'

const CHAT_PROMPT_FILE = fileURLToPath(new URL('../prompts/chat.md', import.meta.url))

/** Tool name the model calls to ask for a mode change. */
export const CONTEXT_SWITCH = 'context_switch'

/** Deployment-owned configuration of the core. */
export interface CoreSetConfig {
  /** Mode a session starts in before any `ile/mode` event. */
  mode?: string
}

const ileStateSchema = zod.object({
  mode: zod.string(),
  summary: zod.string().nullable(),
}).strict()

const ileViewSchema = zod.object({
  mode: zod.string(),
  summary: zod.string().nullable(),
}).strict()

/** Projection of the logged mode and its handoff summary. */
export const ileProjectionDefinition = {
  key: 'ile',
  stateVersion: 1,
  stateSchema: ileStateSchema,
  init: (): IleUnitState => ({ mode: '', summary: null }),
  apply: (state, event) => {
    if (event.type === 'ile/mode') {
      return { mode: event.data.mode, summary: event.data.summary }
    }
    return state
  },
  wire: {
    viewSchema: ileViewSchema,
    view: (state) => ({ mode: state.mode, summary: state.summary }),
  },
} satisfies ProjectionDefinition<'ile', IleUnitState>

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The mode registry every persona plugin contributes to. */
    ileModes: IleModes
  }
}

/**
 * `ctx.ileModes`: owns the persona section, the shared tools, the mode registry
 * and the fold-with-handoff switch. One instance per preset scope; the
 * projection key is shared, so several presets may mount it at once.
 */
export class IleModes extends Service {
  static inject = ['systemPrompt', 'tools', 'sessionProjections']

  static Config: z<CoreSetConfig> = z.object({
    mode: z.string().default(CHAT_MODE),
  }) as z<CoreSetConfig>

  /** Mode a session starts in. */
  private readonly defaultMode: string

  /** Modes this preset can be in, by id. Per instance: a preset owns its persona set. */
  private readonly modes = new Map<string, IleModeDefinition>()

  /** Switches waiting for the next turn boundary, per session. */
  private readonly pendingIntents = new WeakMap<Session, IleModeEvent>()

  constructor(ctx: Context, config: CoreSetConfig = {}) {
    super(ctx, 'ileModes')
    this.defaultMode = config.mode ?? CHAT_MODE
    this.registerMode({
      id: CHAT_MODE,
      name: '聊天',
      text: composePrompt(['common'], readFileSync(CHAT_PROMPT_FILE, 'utf8')),
      switchable: true,
    })

    ctx.systemPrompt.section({
      name: ILE_SECTION,
      order: 0,
      complete: true,
      text: (context) => {
        if (context.agent === undefined) return ''
        return this.renderSection(context.agent.session)
      },
    })
    ctx.systemPrompt.suppressRuntimeContext()
    ctx.effect(() => ctx.systemPrompt.context({
      name: 'working-directory:current',
      order: ctx.systemPrompt.getContextOrder('WORKING_DIRECTORY'),
      required: true,
      interpolate: false,
      text: '',
    }), 'coreset.hideCwdContext()')

    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'read_note',
      description: '读一份科目备注：math（理科）或 arts（文科）。按科目判题、提问或写教师轨迹之前先读一次。',
      parameters: {
        note: { type: 'string', required: true, description: '科目备注名：math（理科）或 arts（文科）' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => readNote(args.note),
    })), 'coreset.readNote()')

    ctx.effect(() => ctx.tools.register(defineTool({
      name: CONTEXT_SWITCH,
      description: '换一个模式。学生下一次开口时生效：之前的对话会收成你写的这段摘要，旧记录不再进入上下文。学生没有明确提出要换，不要自己换。',
      parameters: {
        to: { type: 'string', required: true, description: '目标模式 id，见提示词里列出的可切模式' },
        summary: {
          type: 'string',
          required: true,
          description: '交接摘要：这段做到哪、卡在哪、下一步从哪接。写给下一个模式的自己看，不是写给学生的客套话。',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args, exec) => {
        const agent = exec.agent
        if (agent === undefined) throw new Error(`${CONTEXT_SWITCH} 需要一个调用方 agent（这条上下文没有会话可切）`)
        const target = this.modes.get(args.to.trim().toLowerCase())
        if (target === undefined) {
          throw new Error(`没有「${args.to}」这个模式。现在能切到：${this.switchableModes().map((mode) => `${mode.id}（${mode.name}）`).join('、') || '（没有）'}。`)
        }
        if (!target.switchable) throw new Error(`「${target.name}」只能作为它自己的预设进入，不能在会话里切过去。`)
        const summary = args.summary.trim()
        if (summary === '') throw new Error(`${CONTEXT_SWITCH} 需要 summary：把这段对话压成交接摘要再切。`)
        const from = this.effectiveMode(agent.session)
        if (from === target.id) return `已经在「${target.name}」里，没有切换。`
        this.pendingIntents.set(agent.session, { mode: target.id, summary })
        return `已安排切到「${target.name}」：学生下一次开口时，之前的对话会收成这段摘要，之后按「${target.name}」的规矩来。这一轮还没说完的话，现在说完。`
      },
    })), 'coreset.contextSwitch()')

    ctx.sessionProjections.register(ileProjectionDefinition)

    // Pre-step runs outside Session.append publication, so the fold below can
    // append inside an open turn without re-entering the session. It runs only
    // at a turn boundary: replacing a step-2 range would leave the tool call of
    // the step in flight without its result.
    ctx.on('agent/pre-step', async ({ agent, step, signal }, next): Promise<PreStepDecision> => {
      const decision = await next()
      const pending = this.pendingIntents.get(agent.session)
      if (decision.kind === 'reject' || signal.aborted || pending === undefined || step !== 1) return decision
      try {
        this.commit(agent, pending)
      } catch (error) {
        ctx.logger.warn('dsh-plugin-coreset: failed to fold history at the switch: %o', error)
      }
      return decision
    })
  }

  /**
   * Contribute a mode to this preset.
   * @param definition - id, display name, persona text and whether the switch may target it.
   * @returns disposer that removes the mode again.
   */
  registerMode(definition: IleModeDefinition): () => void {
    const id = definition.id.trim().toLowerCase()
    if (id === '') throw new Error('ile mode id must not be empty')
    if (this.modes.has(id)) throw new Error(`ile mode "${id}" is already registered in this preset`)
    this.modes.set(id, { ...definition, id })
    return () => {
      this.modes.delete(id)
    }
  }

  /** The mode this preset starts in. */
  get startMode(): string {
    return this.defaultMode
  }

  /** Modes `context_switch` accepts, in registration order. */
  switchableModes(): IleModeDefinition[] {
    return [...this.modes.values()].filter((mode) => mode.switchable)
  }

  /** The mode in force for a session (logged state, else this preset's start mode). */
  loggedMode(session: Session): string {
    const state = this.ctx.sessionProjections.stateOf(session, 'ile')
    const mode = state?.mode ?? ''
    return mode === '' ? this.defaultMode : mode
  }

  /**
   * The mode whose text this step's system prompt carries. A pending switch is
   * already in force for the assembly of the turn it belongs to, which starts
   * before the fold happens; mid-turn steps keep the logged mode.
   */
  effectiveMode(session: Session): string {
    const pending = this.pendingIntents.get(session)
    if (pending !== undefined && this.isTurnStart(session)) return pending.mode
    return this.loggedMode(session)
  }

  /** Whether this step is the first of its turn, i.e. history has not grown yet. */
  private isTurnStart(session: Session): boolean {
    const boundary = this.ctx.sessionProjections.stateOf(session, 'turnBoundary')
    if (boundary === undefined) return false
    if (boundary.openTurnStartSeq === null) return true
    const nodes = session.surface.nodes
    const last = nodes[nodes.length - 1]
    return last === undefined || last <= boundary.openTurnStartSeq
  }

  /** The complete section: the persona in force plus the switch footer. */
  private renderSection(session: Session): string {
    const mode = this.effectiveMode(session)
    const persona = this.modes.get(mode)?.text ?? this.modes.get(CHAT_MODE)?.text ?? ''
    const targets = this.switchableModes().filter((candidate) => candidate.id !== mode)
    if (targets.length === 0) return persona
    return [
      persona.trimEnd(),
      '',
      '## 切换模式',
      `现在能切到：${targets.map((candidate) => `${candidate.id}（${candidate.name}）`).join('、')}。`,
      `学生明确要换的时候，调 ${CONTEXT_SWITCH}（参数 to 和 summary）：summary 写「这段做到哪、卡在哪、下一步从哪接」。切换在学生下一次开口时生效，之前那段对话只留这份摘要。学生没提，不要主动切。`,
      '',
    ].join('\n')
  }

  /** Display name of a mode id, falling back to the id itself. */
  private modeName(id: string): string {
    return this.modes.get(id)?.name ?? id
  }

  /**
   * Fold the switched-away conversation into one notice and record the mode.
   * The system head is left alone: the runtime replaces it with the new mode's
   * text as soon as the surface generation changes.
   */
  private commit(agent: Agent, pending: IleModeEvent): void {
    const session = agent.session
    const from = this.loggedMode(session)
    const summary = pending.summary ?? ''
    const notice = createUserMessage({
      content: [{
        type: 'text',
        text: handoffNotice({ from: this.modeName(from), to: this.modeName(pending.mode), summary }),
      }],
      source: { kind: 'ile-handoff', form: 'notice', summary: boundSummary(summary) },
    })
    // Everything that can reject is computed before the first append: a failed
    // fold then leaves the session untouched, and the intent stays pending for
    // the next boundary instead of vanishing.
    const range = replacementRange(session.surface.nodes)
    session.append('ile/mode', pending)
    if (range === null) {
      session.append('user/message', notice, { surfaceOp: 'append' })
    } else {
      session.append('user/message', notice, {
        surfaceOp: { op: 'replace', startSeq: range.startSeq, endSeq: range.endSeq },
        sourceEventSeqs: range.sourceEventSeqs,
      })
    }
    this.pendingIntents.delete(session)
  }
}

export default IleModes
