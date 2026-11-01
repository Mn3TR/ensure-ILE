/**
 * The two presets a learner picks from. Both mount the core and all four
 * personas, so both can switch modes in-session; they differ only in which mode
 * the session starts in. That is what makes an in-session switch possible —
 * every persona of a preset is already loaded, so switching only swaps the mode
 * the core reads.
 *
 * The 开学 preset is not here: dsh-plugin-setup registers it itself, and only
 * while onboarding is unfinished.
 *
 * @module dsh-plugin-coreset/presets
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'

/**
 * The preset's rows, all inside one `ileModes` realm.
 *
 * Every preset mounts its own core, and the core publishes the `ileModes`
 * service. Two cores in the same realm collide at construction ("service
 * \"ileModes\" has been registered"), and the registry reads a service
 * published into the root realm as a leak, rejecting the whole preset with
 * "Preset services require isolate realms" (agent-preset-registry/mount.ts
 * `leakedServices`). A group with `isolate` gives the core a realm of its own
 * per preset; the personas sit in the same group so each resolves the core it
 * was mounted with.
 *
 * Only `ileModes` is isolated: systemPrompt, tools and sessionProjections must
 * keep resolving to the Host's single instances.
 * @param rows - the core and the personas of one preset.
 * @returns the row list the preset declares.
 */
function ileRealm(rows: PresetDefinition['plugins']): PresetDefinition['plugins'] {
  return [{
    id: 'ile',
    name: 'cordis:group',
    group: true,
    isolate: { ileModes: true },
    config: rows,
  }]
}

/**
 * The model's clock, mounted in every preset.
 *
 * A learner session has no shell: the tool surface is deliberately narrow, and
 * handing the model `bash` just to read the wall clock would give an unreviewed
 * command runner to a workspace-write session (we mount no approval UI), and
 * `toolUpdate: 'addition-only'` would make that permanent for every mode in
 * the preset. The upstream plugin instead appends one sourced user message per
 * qualifying step (timestamp + browser zone + elapsed), append-only after the
 * reusable prefix, so the KV cache stays valid (dsh-time-context README.zh.md).
 * 60 s: a tutoring exchange usually spans minutes, so each fresh opening gets a
 * reading without one appearing between two quick follow-ups.
 *
 * The id needs the `ile-` prefix: upstream rows keep their own short ids, and a
 * collision aborts the whole composed profile (assertUniqueEntryIds).
 */
const TIME_CONTEXT_ROW = {
  id: 'ile-time-context',
  name: '@deepseek-ai/dsh-time-context',
  config: { timeZone: 'Asia/Shanghai', refreshIntervalMs: 60_000 },
}

/** 做题: the three study personas behind one switch. */
export const WORK_PRESET: PresetDefinition = {
  id: 'work',
  name: 'Work',
  description: '引导、独立做题、答案优化三种模式，在会话里随时换',
  order: 45,
  plugins: ileRealm([
    { id: 'coreset', name: 'dsh-plugin-coreset', config: { mode: 'guide' } },
    { id: 'guide', name: 'dsh-plugin-guide' },
    { id: 'work', name: 'dsh-plugin-work' },
    { id: 'hrl', name: 'dsh-plugin-hrl' },
    TIME_CONTEXT_ROW,
  ]),
}

/**
 * 聊天: the way in and the way out of a session — it just starts in 聊天.
 *
 * The three study personas are mounted here too, and that is deliberate: the
 * chat persona tells the model to hand over through
 * `context_switch({ to: 'work' })` the moment the learner wants to work on a
 * problem (prompts/chat.md). `modes` is per preset, so leaving the personas out
 * made that call fail every time with "没有「work」这个模式" — measured
 * 2026-11-01 on a real session. Personas only register text (no tools), so
 * mounting them costs a prompt line and nothing else; the two presets now
 * differ in the mode they start in, not in what they can switch to.
 */
export const CHAT_PRESET: PresetDefinition = {
  id: 'chat',
  name: 'Chat',
  description: '先随便说说话，想做题了再切 Work',
  order: 60,
  plugins: ileRealm([
    { id: 'coreset', name: 'dsh-plugin-coreset', config: { mode: 'chat' } },
    { id: 'guide', name: 'dsh-plugin-guide' },
    { id: 'work', name: 'dsh-plugin-work' },
    { id: 'hrl', name: 'dsh-plugin-hrl' },
    TIME_CONTEXT_ROW,
  ]),
}

/**
 * Registers both presets at the profile root. Registration is awaited in
 * {@link Service.init} because the registry returns the disposer we must hold.
 */
export default class CoreSetPresets {
  static inject = ['agentPresets']

  constructor(private readonly ctx: Context) {}

  async *[Service.init](): AsyncGenerator<() => void> {
    const disposers = [
      await this.ctx.agentPresets.register(WORK_PRESET),
      await this.ctx.agentPresets.register(CHAT_PRESET),
    ]
    yield () => {
      for (const dispose of disposers) void dispose()
    }
  }
}
