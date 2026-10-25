import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { composePrompt } from "dsh-plugin-teaching-commons";
import { dirname, join } from "node:path";
//#region src/state.ts
/**
* Progress record for the first-run conversation.
*
* Kept apart from the plugin row so it carries no Cordis or tool dependency:
* the store is testable on its own and the row is only wiring.
* @module dsh-plugin-setup/state
*/
/** Whether the onboarding conversation has finished. */
const ONBOARDING_STATES = ["pending", "done"];
const FACT_KEYS$1 = [
	"grade",
	"schedule",
	"rhythm",
	"preference"
];
/**
* Resolve the default progress file under the Harness home.
* @returns the absolute path.
*/
function defaultStateFile() {
	const home = process.env.DSH_HOME?.trim();
	return home !== void 0 && home.length > 0 ? join(home, "setup.json") : join(process.cwd(), "setup.json");
}
/**
* Read the progress record, or an empty pending one.
* @param file - absolute path.
* @returns the record; a corrupt file starts over rather than blocking onboarding.
*/
function readState(file) {
	if (!existsSync(file)) return {
		schema: 1,
		onboarding: "pending",
		got: {}
	};
	let raw;
	try {
		raw = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return {
			schema: 1,
			onboarding: "pending",
			got: {}
		};
	}
	const value = typeof raw === "object" && raw !== null ? raw : {};
	const got = {};
	const source = typeof value.got === "object" && value.got !== null ? value.got : {};
	for (const key of FACT_KEYS$1) {
		const entry = source[key];
		if (typeof entry === "string" && entry.length > 0) got[key] = entry;
	}
	return {
		schema: 1,
		onboarding: value.onboarding === "done" ? "done" : "pending",
		got,
		...typeof value.next === "string" ? { next: value.next } : {},
		...typeof value.updatedAt === "string" ? { updatedAt: value.updatedAt } : {}
	};
}
/**
* Apply one patch and persist it atomically.
* @param file - absolute path.
* @param patch - the fields to write.
* @param now - clock injection for tests.
* @returns the merged record.
*/
function updateState(file, patch, now = /* @__PURE__ */ new Date()) {
	const current = readState(file);
	const got = { ...current.got };
	for (const key of FACT_KEYS$1) {
		const value = patch[key];
		if (value !== void 0) got[key] = value;
	}
	const next = {
		schema: 1,
		onboarding: patch.onboarding === "done" ? "done" : patch.onboarding === "pending" ? "pending" : current.onboarding,
		got,
		...patch.next !== void 0 ? { next: patch.next } : current.next !== void 0 ? { next: current.next } : {},
		updatedAt: now.toISOString()
	};
	mkdirSync(dirname(file), { recursive: true });
	const temporary = file + ".tmp";
	writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n");
	renameSync(temporary, file);
	return next;
}
//#endregion
//#region src/index.ts
/**
* First-run conversation for ensure-ILE.
*
* One preset (`setup`), one job: ask a learner's grade, timetable, rhythm and
* solving preference, then say what happens next. Progress is field-level in
* `<DSH_HOME>/setup.json`, so an interrupted onboarding resumes where it
* stopped instead of starting over.
* @module dsh-plugin-setup
*/
/** Cordis plugin name. */
const name = "plugin-setup";
/** Services used by this row. */
const inject = ["systemPrompt", "tools"];
/** Runtime schema for the setup row. */
const Config = z.object({
	/** Absolute path to the setup document; empty means the packaged copy. */
	promptFile: z.string().default(""),
	/** Absolute path to the progress file; empty means `<DSH_HOME>/setup.json`. */
	stateFile: z.string().default("")
});
/** The system-prompt section the setup conversation occupies. */
const SETUP_SECTION = "setup";
const DEFAULT_PROMPT_FILE = fileURLToPath(new URL("../prompts/setup.md", import.meta.url));
const FACT_KEYS = [
	"grade",
	"schedule",
	"rhythm",
	"preference"
];
/**
* Mount the setup conversation and its two tools on this scope.
* @param ctx - an agent scope context; the preset mounts this row per session.
* @param config - where the document and the progress file live.
*/
function apply(ctx, config) {
	const promptFile = config.promptFile !== void 0 && config.promptFile.length > 0 ? config.promptFile : DEFAULT_PROMPT_FILE;
	const stateFile = config.stateFile !== void 0 && config.stateFile.length > 0 ? config.stateFile : defaultStateFile();
	ctx.effect(() => ctx.systemPrompt.section({
		name: SETUP_SECTION,
		order: 0,
		text: composePrompt(["common"], readFileSync(promptFile, "utf8")),
		complete: true
	}), "setup.section()");
	ctx.systemPrompt.suppressRuntimeContext();
	ctx.effect(() => ctx.systemPrompt.context({
		name: "working-directory:current",
		order: ctx.systemPrompt.getContextOrder("WORKING_DIRECTORY"),
		required: true,
		interpolate: false,
		text: ""
	}), "setup.hideCwdContext()");
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
export { Config, ONBOARDING_STATES, SETUP_SECTION, apply, defaultStateFile, inject, name, readState, updateState };

//# sourceMappingURL=index.js.map