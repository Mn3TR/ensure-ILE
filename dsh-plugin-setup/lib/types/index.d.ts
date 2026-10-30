/**
 * First-run conversation for ensure-ILE.
 *
 * One persona (`setup`, reachable only as its own preset) and the two tools
 * that record progress field-by-field in `<DSH_HOME>/setup.json`, so an
 * interrupted onboarding resumes where it stopped instead of starting over.
 *
 * The persona text is contributed to the core's mode registry; the section, the
 * cwd shadow and `read_note` belong to `dsh-plugin-coreset`.
 *
 * @module dsh-plugin-setup
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export type { OnboardingState, SetupFacts, SetupPatch, SetupState } from './state.ts';
export { defaultStateFile, ONBOARDING_STATES, readState, updateState } from './state.ts';
/** Cordis plugin name. */
export declare const name = "plugin-setup";
/** Services used by this row. */
export declare const inject: string[];
/** Runtime schema for the setup row. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    /** Absolute path to the setup document; empty means the packaged copy. */
    promptFile: z<string, string, "defined">;
    /** Absolute path to the progress file; empty means `<DSH_HOME>/setup.json`. */
    stateFile: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    /** Absolute path to the setup document; empty means the packaged copy. */
    promptFile: z<string, string, "defined">;
    /** Absolute path to the progress file; empty means `<DSH_HOME>/setup.json`. */
    stateFile: z<string, string, "defined">;
}>>, "plain">;
/** Resolved configuration shape. */
export interface Config {
    promptFile?: string;
    stateFile?: string;
}
/** Mode id the 开学 preset starts in. */
export declare const SETUP_MODE = "setup";
/**
 * Register the 开学 persona and its two tools on this scope.
 * @param ctx - an agent scope context; the setup preset mounts this row per session.
 * @param config - where the document and the progress file live.
 */
export declare function apply(ctx: Context, config: Config): void;
