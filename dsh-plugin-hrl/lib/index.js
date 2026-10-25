import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { composePrompt, readNote } from "dsh-plugin-teaching-commons";
//#region src/index.ts
/**
* Answer optimization for ensure-ILE.
*
* One row: replace the system prompt with the shared fragments plus the HRL
* document, and expose `read_note` so "站得住" is judged by the subject's own
* criteria rather than a general impression.
* @module dsh-plugin-hrl
*/
/** Cordis plugin name. */
const name = "plugin-hrl";
/** Services used by this row. */
const inject = ["systemPrompt", "tools"];
/** Runtime schema for the HRL row. */
const Config = z.object({ 
/** Absolute path to the HRL document; empty means the packaged copy. */
promptFile: z.string().default("") });
/** The system-prompt section answer optimization occupies. */
const HRL_SECTION = "hrl";
const DEFAULT_PROMPT_FILE = fileURLToPath(new URL("../prompts/hrl.md", import.meta.url));
/**
* Mount answer optimization and its note reader on this scope.
* @param ctx - an agent scope context; the preset mounts this row per session.
* @param config - where the HRL document lives.
*/
function apply(ctx, config) {
	const text = composePrompt(["common", "bank"], readFileSync(config.promptFile !== void 0 && config.promptFile.length > 0 ? config.promptFile : DEFAULT_PROMPT_FILE, "utf8"));
	ctx.effect(() => ctx.systemPrompt.section({
		name: "hrl",
		order: 0,
		text,
		complete: true
	}), "hrl.section()");
	ctx.systemPrompt.suppressRuntimeContext();
	ctx.effect(() => ctx.systemPrompt.context({
		name: "working-directory:current",
		order: ctx.systemPrompt.getContextOrder("WORKING_DIRECTORY"),
		required: true,
		interpolate: false,
		text: ""
	}), "hrl.hideCwdContext()");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "read_note",
		description: "读取一个科目的评价标准。写教师轨迹、判断他的答案站不站得住之前，按科目调用一次。",
		parameters: { note: {
			type: "string",
			required: true,
			description: "科目备注名：math（理科）或 arts（文科）"
		} },
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		execute: async (args) => readNote(args.note)
	})), "hrl.readNote()");
}
//#endregion
export { Config, HRL_SECTION, apply, inject, name };

//# sourceMappingURL=index.js.map