import { i as updateState, n as defaultStateFile, r as readState, t as ONBOARDING_STATES } from "./state-AWeyxRsN.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { composePrompt } from "dsh-plugin-teaching-commons";
//#region src/index.ts
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
/** Cordis plugin name. */
const name = "plugin-setup";
/** Services used by this row. */
const inject = ["ileModes", "tools"];
/** Runtime schema for the setup row. */
const Config = z.object({
	/** Absolute path to the setup document; empty means the packaged copy. */
	promptFile: z.string().default(""),
	/** Absolute path to the progress file; empty means `<DSH_HOME>/setup.json`. */
	stateFile: z.string().default("")
});
/** Mode id the 开学 preset starts in. */
const SETUP_MODE = "setup";
const MODE_NAME = "开学";
const DEFAULT_PROMPT_FILE = fileURLToPath(new URL("../prompts/setup.md", import.meta.url));
const FACT_KEYS = [
	"grade",
	"schedule",
	"rhythm",
	"preference"
];
/**
* Register the 开学 persona and its two tools on this scope.
* @param ctx - an agent scope context; the setup preset mounts this row per session.
* @param config - where the document and the progress file live.
*/
function apply(ctx, config) {
	const promptFile = config.promptFile !== void 0 && config.promptFile.length > 0 ? config.promptFile : DEFAULT_PROMPT_FILE;
	const stateFile = config.stateFile !== void 0 && config.stateFile.length > 0 ? config.stateFile : defaultStateFile();
	ctx.effect(() => ctx.ileModes.registerMode({
		id: SETUP_MODE,
		name: MODE_NAME,
		text: composePrompt(["common"], readFileSync(promptFile, "utf8")),
		switchable: false
	}), "setup.mode()");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "setup_read",
		description: "读开学进度：已经问了哪些、还差哪些。开新会话时先读，填过的不重问。",
		parameters: {},
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		execute: async () => JSON.stringify(readState(stateFile), null, 2)
	})), "setup.read()");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "setup_update",
		description: [
			"写开学进度。字段：onboarding（pending / done）、grade、schedule、rhythm、preference、next。",
			"问到一样就写一样；没问到的别传，传了的字段会覆盖。",
			"收尾：能说出「下一步做什么」时才写 onboarding=done 并把那句话放进 next——不是四样问齐。"
		].join("\n"),
		parameters: {
			onboarding: {
				type: "string",
				description: "pending / done"
			},
			grade: {
				type: "string",
				description: "年级与班级"
			},
			schedule: {
				type: "string",
				description: "周几上课、晚自习、周末"
			},
			rhythm: {
				type: "string",
				description: "几点到家、什么时候写作业"
			},
			preference: {
				type: "string",
				description: "解题偏好：先想还是先动笔、几何代数哪边怵"
			},
			next: {
				type: "string",
				description: "下一步做什么（收尾时必须写）"
			}
		},
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		execute: async (args) => {
			const state = updateState(stateFile, {
				...args.onboarding === void 0 ? {} : { onboarding: args.onboarding },
				...args.grade === void 0 ? {} : { grade: args.grade },
				...args.schedule === void 0 ? {} : { schedule: args.schedule },
				...args.rhythm === void 0 ? {} : { rhythm: args.rhythm },
				...args.preference === void 0 ? {} : { preference: args.preference },
				...args.next === void 0 ? {} : { next: args.next }
			});
			const filled = FACT_KEYS.filter((key) => state.got[key] !== void 0);
			return "已记：" + (filled.length === 0 ? "（还没有）" : filled.join("、")) + "；状态 " + state.onboarding + (state.next === void 0 ? "" : "；下一步：" + state.next);
		}
	})), "setup.update()");
}
//#endregion
export { Config, ONBOARDING_STATES, SETUP_MODE, apply, defaultStateFile, inject, name, readState, updateState };

//# sourceMappingURL=index.js.map