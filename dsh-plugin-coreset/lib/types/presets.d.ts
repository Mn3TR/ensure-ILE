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
import { Service } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry';
/** 做题: the three study personas behind one switch. */
export declare const WORK_PRESET: PresetDefinition;
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
