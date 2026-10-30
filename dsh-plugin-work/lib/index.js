import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import z from "@deepseek-ai/schemastery";
import { composePrompt } from "dsh-plugin-teaching-commons";
//#region src/index.ts
/**
* Work mode persona for ensure-ILE: the learner solves alone, hands in, we judge result and reasoning.
*
* No section, no tool and no cwd shadow of its own any more: the core
* (`dsh-plugin-coreset`) owns the one `complete` section, `read_note` and the
* shadow, because a preset that mounts three personas may only have one of each.
* This row contributes nothing but its mode text.
*
* @module dsh-plugin-work
*/
/** Cordis plugin name. */
const name = "plugin-work";
/** The core's mode registry is the only service this row needs. */
const inject = ["ileModes"];
/** Runtime schema for the row. */
const Config = z.object({ 
/** Absolute path to the persona document; empty means the packaged copy. */
promptFile: z.string().default("") });
/** Mode id `context_switch` accepts. */
const WORK_MODE = "work";
const MODE_NAME = "独立做题";
const DEFAULT_PROMPT_FILE = fileURLToPath(new URL("../prompts/work.md", import.meta.url));
/**
* Register this mode's persona text with the core.
* @param ctx - an agent scope context; a preset mounts this row per session.
* @param config - where the persona document lives.
*/
function apply(ctx, config) {
	const text = composePrompt(["common", "bank"], readFileSync(config.promptFile !== void 0 && config.promptFile.length > 0 ? config.promptFile : DEFAULT_PROMPT_FILE, "utf8"));
	ctx.effect(() => ctx.ileModes.registerMode({
		id: WORK_MODE,
		name: MODE_NAME,
		text,
		switchable: true
	}), "work.mode()");
}
//#endregion
export { Config, WORK_MODE, apply, inject, name };

//# sourceMappingURL=index.js.map