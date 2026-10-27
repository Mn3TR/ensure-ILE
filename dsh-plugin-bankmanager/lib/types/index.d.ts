/**
 * Problem bank for ensure-ILE — the shared record every mode reads.
 *
 * One row registers six model tools over {@link ./store.ts}; the bank itself
 * lives under `<DSH_HOME>/bank/problems`, one JSON file per problem, so guide,
 * work, HRL and schedule all see the same data. The bundle patch mounts this
 * row at the profile root, which makes the tools visible to every session.
 *
 * The tool descriptions carry the usage rules because guide mode's prompt is a
 * complete section: no other prompt section survives it.
 * @module dsh-plugin-bankmanager
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name. */
export declare const name = "plugin-bankmanager";
/**
 * Services used by this row. Only the tool registry is required: the browser channel's
 * web pair (`webServer` / `webStartup`) arrives through a nested inject, so a profile
 * without the web-app bundle still gets every tool instead of a permanently pending row.
 */
export declare const inject: string[];
/** Runtime schema for the bank row. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    /** Absolute bank directory; empty means `<DSH_HOME>/bank/problems`. */
    directory: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    /** Absolute bank directory; empty means `<DSH_HOME>/bank/problems`. */
    directory: z<string, string, "defined">;
}>>, "plain">;
/** Resolved configuration shape. */
export interface Config {
    directory?: string;
}
/**
 * Mount the bank tools on this scope.
 * @param ctx - profile-root context; the row registers host-wide tools.
 * @param config - where the bank directory lives.
 */
export declare function apply(ctx: Context, config: Config): void;
