/**
 * Work mode for ensure-ILE.
 *
 * One row, two jobs: replace the system prompt with the shared teaching
 * fragments plus the work document, and expose `read_note` so the model can
 * judge against the per-subject criteria. The learner never sees the notes —
 * they are judging material, not teaching material.
 * @module dsh-plugin-work
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name. */
export declare const name = "plugin-work";
/** Services used by this row. */
export declare const inject: string[];
/** Runtime schema for the work row. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    /** Absolute path to the work document; empty means the packaged copy. */
    promptFile: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    /** Absolute path to the work document; empty means the packaged copy. */
    promptFile: z<string, string, "defined">;
}>>, "plain">;
/** Resolved configuration shape. */
export interface Config {
    promptFile?: string;
}
/** The system-prompt section work mode occupies. */
export declare const WORK_SECTION = "work";
/**
 * Mount work mode and its note reader on this scope.
 * @param ctx - an agent scope context; the preset mounts this row per session.
 * @param config - where the work document lives.
 */
export declare function apply(ctx: Context, config: Config): void;
