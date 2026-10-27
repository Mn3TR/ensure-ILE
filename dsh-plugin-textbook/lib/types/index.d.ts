/**
 * Textbook anchor for ensure-ILE — three read-only hands over the committed corpus.
 *
 * Every mode's prompt is a `complete` section, so no prompt section survives it:
 * the rules have to live in the tool descriptions, exactly as the bank does it.
 * These three tools answer one question — "what does the book actually say on
 * page N" — because a model that cannot look it up will happily invent a 定理.
 *
 * Nothing here writes: the corpus is built at development time by
 * `scripts/extract.py` and shipped in `data/`. At runtime there is no PDF and no
 * Python, so a broken corpus degrades to one sentence, never to a crash.
 * @module dsh-plugin-textbook
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name. */
export declare const name = "plugin-textbook";
/** Only the tool registry is required; this row has no browser half and no host service. */
export declare const inject: string[];
/** Runtime schema for the textbook row. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    /** Absolute corpus directory; empty means the package's own `data/`. */
    dataDirectory: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    /** Absolute corpus directory; empty means the package's own `data/`. */
    dataDirectory: z<string, string, "defined">;
}>>, "plain">;
/** Resolved configuration shape. */
export interface Config {
    dataDirectory?: string;
}
/**
 * Mount the three textbook tools on this scope.
 * @param ctx - profile-root context; the row registers host-wide tools.
 * @param config - where the corpus lives.
 */
export declare function apply(ctx: Context, config: Config): void;
