/**
 * The 开学 preset, registered only while onboarding is unfinished.
 *
 * The registry has no hidden flag: `list()` reads the live definitions, so not
 * registering is how 开学 disappears from the picker. The state is read once at
 * startup — a learner who finishes onboarding sees it gone after the next start.
 *
 * @module dsh-plugin-setup/presets
 */
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry';
/** The one preset this package owns. */
export declare const SETUP_PRESET: PresetDefinition;
/** Configuration of the conditional registration. */
export interface PresetsConfig {
    /** Absolute path to the progress file; empty means `<DSH_HOME>/setup.json`. */
    stateFile?: string;
}
/**
 * Registers {@link SETUP_PRESET} when onboarding has not been finished.
 * Registration is awaited in {@link Service.init} because the registry returns
 * the disposer this row must hold.
 */
export default class SetupPresets {
    private readonly ctx;
    private readonly config;
    static inject: string[];
    static Config: z<PresetsConfig>;
    constructor(ctx: Context, config?: PresetsConfig);
    [Service.init](): AsyncGenerator<() => void>;
}
