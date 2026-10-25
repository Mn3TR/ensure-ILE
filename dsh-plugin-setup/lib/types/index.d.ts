/**
 * First-run conversation for ensure-ILE.
 *
 * One preset (`setup`), one job: ask a learner's grade, timetable, rhythm and
 * solving preference, then say what happens next. Progress is field-level in
 * `<DSH_HOME>/setup.json`, so an interrupted onboarding resumes where it
 * stopped instead of starting over.
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
/** The system-prompt section the setup conversation occupies. */
export declare const SETUP_SECTION = "setup";
/**
 * Mount the setup conversation and its two tools on this scope.
 * @param ctx - an agent scope context; the preset mounts this row per session.
 * @param config - where the document and the progress file live.
 */
export declare function apply(ctx: Context, config: Config): void;
