/**
 * Answer optimization for ensure-ILE.
 *
 * One row: replace the system prompt with the shared fragments plus the HRL
 * document, and expose `read_note` so "站得住" is judged by the subject's own
 * criteria rather than a general impression.
 * @module dsh-plugin-hrl
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name. */
export declare const name = "plugin-hrl";
/** Services used by this row. */
export declare const inject: string[];
/** Runtime schema for the HRL row. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    /** Absolute path to the HRL document; empty means the packaged copy. */
    promptFile: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    /** Absolute path to the HRL document; empty means the packaged copy. */
    promptFile: z<string, string, "defined">;
}>>, "plain">;
/** Resolved configuration shape. */
export interface Config {
    promptFile?: string;
}
/** The system-prompt section answer optimization occupies. */
export declare const HRL_SECTION = "hrl";
/**
 * Mount answer optimization and its note reader on this scope.
 * @param ctx - an agent scope context; the preset mounts this row per session.
 * @param config - where the HRL document lives.
 */
export declare function apply(ctx: Context, config: Config): void;
