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
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name. */
export declare const name = "plugin-guide";
/** The core's mode registry is the only service this row needs. */
export declare const inject: string[];
/** Runtime schema for the row. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    /** Absolute path to the persona document; empty means the packaged copy. */
    promptFile: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    /** Absolute path to the persona document; empty means the packaged copy. */
    promptFile: z<string, string, "defined">;
}>>, "plain">;
/** Resolved configuration shape. */
export interface Config {
    promptFile?: string;
}
/** Mode id `context_switch` accepts. */
export declare const GUIDE_MODE = "guide";
/**
 * Register this mode's persona text with the core.
 * @param ctx - an agent scope context; a preset mounts this row per session.
 * @param config - where the persona document lives.
 */
export declare function apply(ctx: Context, config: Config): void;
