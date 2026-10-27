/**
 * Guide persona for ensure-ILE.
 *
 * One row, two jobs: replace the agent's system prompt with the shared teaching
 * fragments plus the guide document, and expose `read_note` so the guide can
 * pull the per-subject notes it tells itself to read. Both are read from disk at
 * mount time, so editing them needs no rebuild.
 * @module dsh-plugin-guide
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name. */
export declare const name = "plugin-guide";
/** Services used by this row. */
export declare const inject: string[];
/** Runtime schema for the guide row. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    /** Absolute path to the guide document; empty means the packaged copy. */
    promptFile: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    /** Absolute path to the guide document; empty means the packaged copy. */
    promptFile: z<string, string, "defined">;
}>>, "plain">;
/** Resolved configuration shape. */
export interface Config {
    promptFile?: string;
}
/** The system-prompt section the guide occupies. */
export declare const GUIDE_SECTION = "guide";
/**
 * Mount the guide persona and its note reader on this scope.
 * @param ctx - an agent scope context; the preset mounts this row per session.
 * @param config - where the guide document lives.
 */
export declare function apply(ctx: Context, config: Config): void;
