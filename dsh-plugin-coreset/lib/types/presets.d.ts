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
import { Service } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry';
/** 做题: the three study personas behind one switch. */
export declare const WORK_PRESET: PresetDefinition;
/** 聊天: no study persona at all; the way in and the way out of a session. */
export declare const CHAT_PRESET: PresetDefinition;
/**
 * Registers both presets at the profile root. Registration is awaited in
 * {@link Service.init} because the registry returns the disposer we must hold.
 */
export default class CoreSetPresets {
    private readonly ctx;
    static inject: string[];
    constructor(ctx: Context);
    [Service.init](): AsyncGenerator<() => void>;
}
