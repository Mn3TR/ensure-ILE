/**
 * Schedule row for ensure-ILE: the timetable and progress that turn "what should
 * I do today" into an answer.
 *
 * Three tools live here — read, update, plan. The schedule itself is one JSON
 * file under the Harness home, so guide / work / HRL sessions all see the same
 * record. The plan reads two neighbouring packages: the problem bank (which
 * problems are due) and the textbook corpus (which pages to read before the next
 * lesson). This row is the only place those imports happen; plan.ts and store.ts
 * stay pure so the tests can run without any host.
 *
 * No prompt section is registered: guide / work / HRL replace the whole prompt,
 * so the usage rules have to live in the tool descriptions.
 * @module dsh-plugin-schedule
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name. */
export declare const name = "plugin-schedule";
/** Only the tool registry is needed: the schedule has no browser half in v1. */
export declare const inject: string[];
/** Runtime schema for the schedule row. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    /** Absolute schedule file; empty means <DSH_HOME>/schedule/schedule.json. */
    file: z<string, string, "defined">;
    /** Absolute bank directory; empty means <DSH_HOME>/bank/problems. */
    bankDirectory: z<string, string, "defined">;
    /** Absolute textbook corpus directory; empty means the textbook package default. */
    textbookData: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    /** Absolute schedule file; empty means <DSH_HOME>/schedule/schedule.json. */
    file: z<string, string, "defined">;
    /** Absolute bank directory; empty means <DSH_HOME>/bank/problems. */
    bankDirectory: z<string, string, "defined">;
    /** Absolute textbook corpus directory; empty means the textbook package default. */
    textbookData: z<string, string, "defined">;
}>>, "plain">;
/** Resolved configuration shape. */
export interface Config {
    file?: string;
    bankDirectory?: string;
    textbookData?: string;
}
/**
 * Mount the schedule tools on this scope.
 * @param ctx - profile-root context; the row registers host-wide tools.
 * @param config - where the schedule file, bank and corpus live.
 */
export declare function apply(ctx: Context, config: Config): void;
