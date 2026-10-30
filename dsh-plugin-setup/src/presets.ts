/**
 * The 开学 preset, registered only while onboarding is unfinished.
 *
 * The registry has no hidden flag: `list()` reads the live definitions, so not
 * registering is how 开学 disappears from the picker. The state is read once at
 * startup — a learner who finishes onboarding sees it gone after the next start.
 *
 * @module dsh-plugin-setup/presets
 */

import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import { defaultStateFile, readState } from './state.ts'

/** The one preset this package owns. */
export const SETUP_PRESET: PresetDefinition = {
  id: 'setup',
  name: '开学',
  description: '第一次见面：问清年级、课表、作息和解题偏好，然后告诉学生下一步',
  order: 30,
  plugins: [
    { name: 'dsh-plugin-coreset', config: { mode: 'setup' } },
    { name: 'dsh-plugin-setup' },
  ],
}

/** Configuration of the conditional registration. */
export interface PresetsConfig {
  /** Absolute path to the progress file; empty means `<DSH_HOME>/setup.json`. */
  stateFile?: string
}

/**
 * Whether 开学 still belongs in the picker.
 *
 * The registry has no hidden flag, so this decides between registering the
 * preset and never registering it — a finished learner sees it gone rather than
 * greyed out.
 * @param stateFile - absolute path to the progress file.
 */
export function shouldRegisterSetup(stateFile: string): boolean {
  return readState(stateFile).onboarding !== 'done'
}

/**
 * Registers {@link SETUP_PRESET} when onboarding has not been finished.
 * Registration is awaited in {@link Service.init} because the registry returns
 * the disposer this row must hold.
 */
export default class SetupPresets {
  static inject = ['agentPresets']

  static Config: z<PresetsConfig> = z.object({
    stateFile: z.string().default(''),
  }) as z<PresetsConfig>

  constructor(private readonly ctx: Context, private readonly config: PresetsConfig = {}) {}

  async *[Service.init](): AsyncGenerator<() => void> {
    const file = this.config.stateFile !== undefined && this.config.stateFile.length > 0
      ? this.config.stateFile
      : defaultStateFile()
    if (!shouldRegisterSetup(file)) {
      yield () => {}
      return
    }
    yield await this.ctx.agentPresets.register(SETUP_PRESET)
  }
}
