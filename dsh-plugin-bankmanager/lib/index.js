import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
//#region src/store.ts
/**
* Problem-bank storage: one JSON file per problem under `<DSH_HOME>/bank/problems`.
*
* A record holds everything that ever happened to one problem — the statement,
* the guide sessions, attempts, the review schedule and an append-only history.
* Files are written atomically and read defensively: one broken file is skipped
* and reported, never a reason to fail a listing.
* @module dsh-plugin-bankmanager/store
*/
/** Statuses a problem can carry. */
const PROBLEM_STATUSES = [
	"new",
	"guide",
	"hrl",
	"review",
	"mastered",
	"parked"
];
/** How one guide session ended. */
const GUIDE_OUTCOMES = [
	"solved",
	"stuck",
	"abandoned"
];
/** Failure with a stable code so tools can explain themselves. */
var BankError = class extends Error {
	code;
	constructor(message, code) {
		super(message);
		this.code = code;
		this.name = "BankError";
	}
};
/** True when the value names a known status. */
function isProblemStatus(value) {
	return PROBLEM_STATUSES.includes(value);
}
/** True when the value names a known guide outcome. */
function isGuideOutcome(value) {
	return GUIDE_OUTCOMES.includes(value);
}
/**
* Turn a free-form subject into the file-name segment of an id.
* Lowercase ASCII letters and digits survive; every other run collapses to one
* dash. An empty result becomes `other`.
* @param subject - the model-chosen subject, in any language.
*/
function slugSubject(subject) {
	const slug = subject.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
	return slug.length > 0 ? slug : "other";
}
/** Format one local date as `YYYYMMDD`. */
function formatDate(date) {
	const year = String(date.getFullYear());
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return year + month + day;
}
/**
* Build a fresh problem id.
* @param subject - free-form subject used for the readable middle segment.
* @param now - clock injection for tests.
* @param suffix - six hex characters; random by default.
*/
function makeProblemId(subject, now = /* @__PURE__ */ new Date(), suffix) {
	return formatDate(now) + "-" + slugSubject(subject) + "-" + (suffix ?? randomBytes(3).toString("hex"));
}
/** Default bank directory under the Harness home shared with the desktop app. */
function defaultBankDirectory(home = process.env.DSH_HOME) {
	return join(home !== void 0 && home.trim().length > 0 ? home : join(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".dsh"), "bank", "problems");
}
/** Path of one problem file. */
function problemPath(directory, id) {
	if (!/^[a-z0-9-]+$/u.test(id)) throw new BankError("题目 id 不合法：" + id, "invalid-id");
	return join(directory, id + ".json");
}
function asString(value, field) {
	if (typeof value !== "string") throw new BankError("字段 " + field + " 必须是字符串", "invalid-record");
	return value;
}
function asArray(value, field) {
	if (!Array.isArray(value)) throw new BankError("字段 " + field + " 必须是数组", "invalid-record");
	return value;
}
/**
* Validate one parsed file. Corrupt files are the caller's to skip; this throws
* so the message names the exact field that broke.
* @param raw - parsed JSON of one problem file.
*/
function parseRecord(raw) {
	if (typeof raw !== "object" || raw === null) throw new BankError("题目文件不是对象", "invalid-record");
	const value = raw;
	if (value.schema !== 1) throw new BankError("schema 必须是 1", "invalid-record");
	const status = asString(value.status, "status");
	if (!isProblemStatus(status)) throw new BankError("未知状态 " + status, "invalid-record");
	const guide = value.guide;
	if (typeof guide !== "object" || guide === null) throw new BankError("guide 必须是对象", "invalid-record");
	const review = value.review;
	if (typeof review !== "object" || review === null) throw new BankError("review 必须是对象", "invalid-record");
	return {
		schema: 1,
		id: asString(value.id, "id"),
		subject: asString(value.subject, "subject"),
		tags: asArray(value.tags ?? [], "tags"),
		statement: asString(value.statement, "statement"),
		attachments: asArray(value.attachments ?? [], "attachments"),
		status,
		createdAt: asString(value.createdAt, "createdAt"),
		updatedAt: asString(value.updatedAt, "updatedAt"),
		guide,
		attempts: asArray(value.attempts ?? [], "attempts"),
		review,
		history: asArray(value.history ?? [], "history")
	};
}
/** Read one problem, or throw a model-facing error. */
function readProblem(directory, id) {
	const file = problemPath(directory, id);
	if (!existsSync(file)) throw new BankError("没有这道题：" + id, "not-found");
	let raw;
	try {
		raw = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		throw new BankError("题目文件损坏：" + id, "corrupt");
	}
	return parseRecord(raw);
}
/**
* List every readable problem. A corrupt file is skipped and named; it never
* fails the listing.
* @param directory - bank directory.
*/
function listProblems(directory) {
	if (!existsSync(directory)) return {
		records: [],
		skipped: []
	};
	const records = [];
	const skipped = [];
	for (const file of readdirSync(directory)) {
		if (!file.endsWith(".json")) continue;
		try {
			records.push(parseRecord(JSON.parse(readFileSync(join(directory, file), "utf8"))));
		} catch (error) {
			skipped.push({
				file,
				reason: error instanceof Error ? error.message : String(error)
			});
		}
	}
	records.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
	return {
		records,
		skipped
	};
}
/** Create and persist one problem. */
async function createProblem(directory, input) {
	const statement = input.statement.trim();
	if (statement.length === 0) throw new BankError("statement 不能为空", "invalid-input");
	const subject = input.subject.trim().length > 0 ? input.subject.trim() : "other";
	const now = input.now ?? /* @__PURE__ */ new Date();
	const at = now.toISOString();
	mkdirSync(directory, { recursive: true });
	let id = "";
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const candidate = makeProblemId(subject, now, attempt === 0 ? input.suffix : void 0);
		if (!existsSync(problemPath(directory, candidate))) {
			id = candidate;
			break;
		}
	}
	if (id.length === 0) throw new BankError("生成题目 id 失败，请重试", "id-collision");
	const record = {
		schema: 1,
		id,
		subject,
		tags: input.tags ?? [],
		statement,
		attachments: [],
		status: "new",
		createdAt: at,
		updatedAt: at,
		guide: { sessions: [] },
		attempts: [],
		review: {
			count: 0,
			history: []
		},
		history: [{
			at,
			event: "created"
		}]
	};
	await writeFileAtomic(problemPath(directory, id), JSON.stringify(record, null, 2) + "\n", {
		mode: 384,
		dirMode: 448
	});
	return record;
}
/**
* Apply one update under a cross-process file lock. Unknown fields merge
* shallowly; arrays replace.
* @param directory - bank directory.
* @param id - problem id.
* @param input - explicit fields plus the free patch.
*/
async function updateProblem(directory, id, input) {
	const file = problemPath(directory, id);
	return withFileLock(file, async () => {
		const record = readProblem(directory, id);
		const at = (input.now ?? /* @__PURE__ */ new Date()).toISOString();
		const events = [];
		if (input.status !== void 0) {
			if (!isProblemStatus(input.status)) throw new BankError("未知状态 " + input.status, "invalid-input");
			if (record.status !== input.status) {
				events.push("status " + record.status + " -> " + input.status);
				record.status = input.status;
			}
		}
		if (input.guideOutcome !== void 0) {
			if (!isGuideOutcome(input.guideOutcome)) throw new BankError("未知结局 " + input.guideOutcome, "invalid-input");
			const open = record.guide.sessions.find((session) => session.endedAt === void 0);
			const session = open ?? { startedAt: at };
			session.endedAt = at;
			session.outcome = input.guideOutcome;
			if (input.whereStuck !== void 0) session.whereStuck = input.whereStuck;
			if (open === void 0) record.guide.sessions.push(session);
			events.push("guide " + input.guideOutcome);
		}
		if (input.insight !== void 0) record.guide.insight = input.insight;
		if (input.reviewNextAt !== void 0) record.review.nextAt = input.reviewNextAt;
		if (input.reviewInterval !== void 0) record.review.interval = input.reviewInterval;
		if (input.attempt !== void 0) {
			record.attempts.push({
				at,
				mode: input.attempt.mode,
				answer: input.attempt.answer,
				verdict: input.attempt.verdict
			});
			events.push("attempt " + input.attempt.mode);
		}
		if (input.patch !== void 0) for (const [key, value] of Object.entries(input.patch)) {
			if (key === "schema" || key === "id" || key === "history") continue;
			record[key] = value;
			events.push("patch " + key);
		}
		record.updatedAt = at;
		for (const event of events.length > 0 ? events : ["updated"]) record.history.push({
			at,
			event
		});
		await writeFileAtomic(file, JSON.stringify(record, null, 2) + "\n", {
			mode: 384,
			dirMode: 448
		});
		return record;
	});
}
/** One-line summary used by `bank_list`. */
function summarizeProblem(record) {
	const statement = record.statement.replace(/\s+/gu, " ").slice(0, 40);
	return [
		record.id,
		record.status,
		record.subject,
		record.createdAt.slice(0, 10),
		statement
	].join(" | ");
}
/**
* Aggregate the whole bank.
* @param records - readable records.
* @param limit - how many stalest problems to report.
*/
function summarizeStats(records, limit = 5) {
	const byStatus = {};
	const bySubject = {};
	for (const record of records) {
		byStatus[record.status] = (byStatus[record.status] ?? 0) + 1;
		bySubject[record.subject] = (bySubject[record.subject] ?? 0) + 1;
	}
	const stalest = [...records].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)).slice(0, limit).map((record) => ({
		id: record.id,
		status: record.status,
		updatedAt: record.updatedAt
	}));
	return {
		total: records.length,
		byStatus,
		bySubject,
		stalest
	};
}
//#endregion
//#region src/index.ts
/** Cordis plugin name. */
const name = "plugin-bankmanager";
/** Services used by this row. */
const inject = ["tools"];
/** Runtime schema for the bank row. */
const Config = z.object({ 
/** Absolute bank directory; empty means `<DSH_HOME>/bank/problems`. */
directory: z.string().default("") });
/** Model-facing text for a store failure. */
function explain(error) {
	if (error instanceof BankError) return error.code + ": " + error.message;
	return "bank error: " + (error instanceof Error ? error.message : String(error));
}
/** One-line JSON with a stable order. */
function json(value) {
	return JSON.stringify(value, null, 2);
}
/**
* Mount the bank tools on this scope.
* @param ctx - profile-root context; the row registers host-wide tools.
* @param config - where the bank directory lives.
*/
function apply(ctx, config) {
	const directory = config.directory !== void 0 && config.directory.length > 0 ? config.directory : defaultBankDirectory();
	ctx.tools.register(defineTool({
		name: "bank_add",
		description: [
			"把一道新题存进题库，返回题目 id。",
			"用在：学生第一次把一道题发给你、或者你判断这次要开始引导一道新题时。",
			"statement 是题干原文，尽量完整（含小问）；subject 是科目，自由写（math、arts、physics、chemistry…）；",
			"tags 可选，放知识点。",
			"同一道题只建一次：不确定建过没有，先用 bank_list 看。"
		].join("\n"),
		parameters: {
			statement: {
				type: "string",
				required: true,
				description: "题干原文"
			},
			subject: {
				type: "string",
				required: true,
				description: "科目，自由字符串"
			},
			tags: {
				type: "array",
				items: { type: "string" },
				description: "知识点标签，可省略"
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
			try {
				const record = await createProblem(directory, {
					statement: args.statement,
					subject: args.subject,
					...args.tags === void 0 ? {} : { tags: args.tags }
				});
				return "已建题：" + record.id + "\n状态：new，科目：" + record.subject;
			} catch (error) {
				return explain(error);
			}
		}
	}));
	ctx.tools.register(defineTool({
		name: "bank_list",
		description: [
			"按状态列出题库里的题，每行：id、状态、科目、建立日期、题干前 40 字。",
			"用在：学生说「接着上次那道题」，或者你想知道现在手上有哪些题。",
			"status 可选：new / guide / hrl / review / mastered / parked；不传则全部。",
			"看到合适的那道题，用 bank_show 读完整记录。"
		].join("\n"),
		parameters: {
			status: {
				type: "string",
				description: "只看某个状态"
			},
			subject: {
				type: "string",
				description: "只看某个科目"
			},
			limit: {
				type: "integer",
				description: "最多返回几条，默认 20"
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
			try {
				const { records, skipped } = listProblems(directory);
				let rows = records;
				if (args.status !== void 0 && args.status.length > 0) rows = rows.filter((record) => record.status === args.status);
				if (args.subject !== void 0 && args.subject.length > 0) {
					const wanted = args.subject.toLowerCase();
					rows = rows.filter((record) => record.subject.toLowerCase() === wanted);
				}
				const limit = args.limit === void 0 ? 20 : Math.max(1, Math.min(100, args.limit));
				const lines = rows.slice(-limit).map(summarizeProblem);
				if (lines.length === 0) return "题库里没有符合条件的题。";
				const header = "共 " + rows.length + " 道，显示最近 " + lines.length + " 道：";
				const broken = skipped.length > 0 ? "\n跳过 " + skipped.length + " 个损坏文件：" + skipped.map((item) => item.file).join("、") : "";
				return header + "\n" + lines.join("\n") + broken;
			} catch (error) {
				return explain(error);
			}
		}
	}));
	ctx.tools.register(defineTool({
		name: "bank_show",
		description: [
			"读一道题的完整记录（题干、引导会话、尝试、复习、历史）。",
			"id 来自 bank_add 或 bank_list。",
			"接着引导一道旧题前，先读它，别让学生重复讲一遍题干。"
		].join("\n"),
		parameters: { id: {
			type: "string",
			required: true,
			description: "题目 id"
		} },
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		execute: async (args) => {
			try {
				return json(readProblem(directory, args.id));
			} catch (error) {
				return explain(error);
			}
		}
	}));
	ctx.tools.register(defineTool({
		name: "bank_update",
		description: [
			"更新一道题。显式字段：status、guideOutcome（solved / stuck / abandoned）、whereStuck、insight、reviewNextAt、reviewInterval、attempt。",
			"patch 是自由对象，浅合并进记录（数组整体替换），用来写工具还没覆盖的字段。",
			"每次修改都会追加 history，updatedAt 自动刷新。",
			"收尾：先问学生「这题你自己做出来了吗」。做出来 → status=review、guideOutcome=solved；",
			"没做出来 → guideOutcome=stuck，status 保持 guide，下次还能接着引导。"
		].join("\n"),
		parameters: {
			id: {
				type: "string",
				required: true,
				description: "题目 id"
			},
			status: {
				type: "string",
				description: "new / guide / hrl / review / mastered / parked"
			},
			guideOutcome: {
				type: "string",
				description: "solved / stuck / abandoned"
			},
			whereStuck: {
				type: "string",
				description: "卡在哪一步（配合 guideOutcome=stuck）"
			},
			insight: {
				type: "string",
				description: "这道题的关键转折，写给以后的自己"
			},
			reviewNextAt: {
				type: "string",
				description: "下次复习时间（ISO 8601）"
			},
			reviewInterval: {
				type: "integer",
				description: "复习间隔（天）"
			},
			attempt: {
				type: "object",
				additionalProperties: false,
				description: "记录一次作答",
				properties: {
					mode: {
						type: "string",
						required: true,
						description: "work / hrl / guide"
					},
					answer: {
						type: "string",
						required: true,
						description: "学生的答案"
					},
					verdict: {
						type: "string",
						required: true,
						description: "ok / partial / wrong"
					}
				}
			},
			patch: {
				type: "json",
				description: "自由字段浅合并"
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
			try {
				const record = await updateProblem(directory, args.id, {
					...args.status === void 0 ? {} : { status: args.status },
					...args.guideOutcome === void 0 ? {} : { guideOutcome: args.guideOutcome },
					...args.whereStuck === void 0 ? {} : { whereStuck: args.whereStuck },
					...args.insight === void 0 ? {} : { insight: args.insight },
					...args.reviewNextAt === void 0 ? {} : { reviewNextAt: args.reviewNextAt },
					...args.reviewInterval === void 0 ? {} : { reviewInterval: args.reviewInterval },
					...args.attempt === void 0 ? {} : { attempt: args.attempt },
					...args.patch === void 0 ? {} : { patch: args.patch }
				});
				return "已更新 " + record.id + "：状态 " + record.status + "，历史 " + record.history.length + " 条。";
			} catch (error) {
				return explain(error);
			}
		}
	}));
	ctx.tools.register(defineTool({
		name: "bank_stats",
		description: ["题库概况：各状态计数、总数、最久没动的 5 道题。", "用在：学生问「我还有多少题没做」，或者你判断先带哪道题。"].join("\n"),
		parameters: {},
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		execute: async () => {
			try {
				const { records, skipped } = listProblems(directory);
				const stats = summarizeStats(records);
				const lines = [
					"总数：" + stats.total,
					"按状态：" + (Object.keys(stats.byStatus).length === 0 ? "（空）" : Object.entries(stats.byStatus).map(([key, value]) => key + "=" + value).join("，")),
					"按科目：" + (Object.keys(stats.bySubject).length === 0 ? "（空）" : Object.entries(stats.bySubject).map(([key, value]) => key + "=" + value).join("，")),
					"最久没动：",
					...stats.stalest.length === 0 ? ["（空）"] : stats.stalest.map((item) => "- " + item.id + " " + item.status + " " + item.updatedAt.slice(0, 10))
				];
				if (skipped.length > 0) lines.push("损坏文件：" + skipped.length + " 个");
				return lines.join("\n");
			} catch (error) {
				return explain(error);
			}
		}
	}));
}
//#endregion
export { Config, apply, inject, name };

//# sourceMappingURL=index.js.map