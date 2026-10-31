/**
 * The two presets a learner picks from. Both mount the core; they differ in
 * which personas are installed inside them, which is exactly what makes an
 * in-session switch possible — every persona of a preset is already loaded, so
 * switching only swaps the mode the core reads.
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
  ]),
}

/** 聊天: no study persona at all; the way in and the way out of a session. */
export const CHAT_PRESET: PresetDefinition = {
  id: 'chat',
  name: 'Chat',
  description: '先随便说说话，想做题了再切 Work',
  order: 60,
  plugins: ileRealm([
    { id: 'coreset', name: 'dsh-plugin-coreset', config: { mode: 'chat' } },
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
