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
/** How the learner seemed during one session. */
const AFFECTS = [
	"frustrated",
	"neutral",
	"excited"
];
/**
* The five rungs of guide.md's hint ladder, lightest first. Recorded per session
* so the next guide knows what actually moved this learner.
*/
const HINT_LEVELS = [
	"confirm",
	"position",
	"feature",
	"structure",
	"result"
];
/** Fixed review intervals in days; the scheduler walks this ladder. */
const REVIEW_LADDER = [
	1,
	3,
	7,
	14,
	30,
	60,
	120
];
/** How one teacher step lines up with the learner's own words. */
const PAIRING_MATCHES = [
	"same",
	"partial",
	"missing"
];
/** Which side the learner kept for one step. */
const PAIRING_CHOICES = [
	"student",
	"teacher",
	"merged"
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
	if (value.schema !== 2) throw new BankError("schema 必须是 2（v1 文件需要手工迁移）", "invalid-record");
	const status = asString(value.status, "status");
	if (!isProblemStatus(status)) throw new BankError("未知状态 " + status, "invalid-record");
	const guide = value.guide;
	if (typeof guide !== "object" || guide === null) throw new BankError("guide 必须是对象", "invalid-record");
	const work = value.work;
	if (typeof work !== "object" || work === null) throw new BankError("work 必须是对象", "invalid-record");
	const review = value.review;
	if (typeof review !== "object" || review === null) throw new BankError("review 必须是对象", "invalid-record");
	const hrl = value.hrl;
	if (hrl !== void 0 && (typeof hrl !== "object" || hrl === null)) throw new BankError("hrl 必须是对象", "invalid-record");
	const handoff = value.handoff;
	if (handoff !== void 0 && (typeof handoff !== "object" || handoff === null)) throw new BankError("handoff 必须是对象", "invalid-record");
	const record = {
		schema: 2,
		id: asString(value.id, "id"),
		subject: asString(value.subject, "subject"),
		tags: asArray(value.tags ?? [], "tags"),
		statement: asString(value.statement, "statement"),
		attachments: asArray(value.attachments ?? [], "attachments"),
		status,
		createdAt: asString(value.createdAt, "createdAt"),
		updatedAt: asString(value.updatedAt, "updatedAt"),
		guide,
		work,
		review,
		history: asArray(value.history ?? [], "history")
	};
	if (hrl !== void 0) record.hrl = hrl;
	if (handoff !== void 0) record.handoff = handoff;
	return record;
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
		schema: 2,
		id,
		subject,
		tags: input.tags ?? [],
		statement,
		attachments: [],
		status: "new",
		createdAt: at,
		updatedAt: at,
		guide: { sessions: [] },
		work: { attempts: [] },
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
/** One rung up the review ladder; the last rung repeats. */
function nextInterval(current) {
	if (current === void 0) return REVIEW_LADDER[0];
	const index = REVIEW_LADDER.indexOf(current);
	if (index < 0) return REVIEW_LADDER[0];
	return REVIEW_LADDER[Math.min(index + 1, REVIEW_LADDER.length - 1)];
}
/** The last pairing still waiting for its result. */
function openPairing(hrl) {
	for (let index = hrl.pairings.length - 1; index >= 0; index -= 1) {
		const pairing = hrl.pairings[index];
		if (pairing !== void 0 && pairing.result === void 0) return pairing;
	}
}
/** Apply one HRL write; steps land in the open pairing, which `result` closes. */
function applyHrl(record, input, at) {
	const events = [];
	const hrl = record.hrl ?? (record.hrl = { pairings: [] });
	if (input.input !== void 0) {
		hrl.input = input.input;
		events.push("hrl input " + input.input.from);
	}
	if (input.teacher !== void 0) {
		hrl.teacher = input.teacher;
		events.push("hrl teacher " + input.teacher.steps.length + " steps");
	}
	if (input.step !== void 0) {
		let pairing = openPairing(hrl);
		if (pairing === void 0) {
			pairing = {
				at,
				steps: []
			};
			hrl.pairings.push(pairing);
		}
		const step = input.step;
		const existing = pairing.steps.findIndex((entry) => entry.index === step.index);
		if (existing >= 0) pairing.steps[existing] = step;
		else pairing.steps.push(step);
		pairing.steps.sort((left, right) => left.index - right.index);
		events.push("hrl step " + step.index + " " + step.match);
	}
	if (input.result !== void 0) {
		const pairing = openPairing(hrl);
		if (pairing === void 0) throw new BankError("没有进行中的对比，先写步骤再写结果", "invalid-input");
		pairing.result = input.result;
		events.push("hrl result");
	}
	return events;
}
/** Write a handoff, dropping whatever unconsumed package it replaces. */
function applyHandoff(record, input, at) {
	const events = [];
	const previous = record.handoff;
	if (previous !== void 0 && previous.consumedAt === void 0) events.push("handoff dropped " + previous.id);
	record.handoff = {
		id: input.id ?? "hlt-" + randomBytes(3).toString("hex"),
		at,
		from: input.from,
		to: input.to,
		why: input.why,
		state: input.state,
		...input.detail === void 0 ? {} : { detail: input.detail }
	};
	events.push("handoff -> " + input.to);
	return events;
}
/** Mark the handoff accepted, or clear that mark so the package is selectable again. */
function consumeHandoff(record, sessionId, at) {
	const handoff = record.handoff;
	if (handoff === void 0) throw new BankError("题库里没有待接收的交接", "invalid-input");
	if (sessionId.length === 0) {
		delete handoff.consumedAt;
		delete handoff.consumerSessionId;
		return ["handoff released"];
	}
	handoff.consumedAt = at;
	handoff.consumerSessionId = sessionId;
	return ["handoff consumed by " + sessionId];
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
		const now = input.now ?? /* @__PURE__ */ new Date();
		const at = now.toISOString();
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
		if (input.guideResult !== void 0) {
			const open = record.guide.sessions.find((session) => session.endedAt === void 0) ?? record.guide.sessions[record.guide.sessions.length - 1];
			if (open === void 0) throw new BankError("没有可写入的引导会话", "invalid-input");
			open.result = input.guideResult;
			events.push("guide result");
		}
		if (input.insight !== void 0) record.guide.insight = input.insight;
		if (input.affect !== void 0 || input.effectiveHint !== void 0) {
			let open = record.guide.sessions.find((session) => session.endedAt === void 0) ?? record.guide.sessions[record.guide.sessions.length - 1];
			if (open === void 0) {
				open = { startedAt: at };
				record.guide.sessions.push(open);
				events.push("guide session opened");
			}
			if (input.affect !== void 0) {
				if (!AFFECTS.includes(input.affect)) throw new BankError("未知情绪 " + input.affect, "invalid-input");
				open.affect = input.affect;
				events.push("affect " + input.affect);
			}
			if (input.effectiveHint !== void 0) {
				if (!HINT_LEVELS.includes(input.effectiveHint)) throw new BankError("未知视角档位 " + input.effectiveHint, "invalid-input");
				open.effectiveHint = input.effectiveHint;
				events.push("effectiveHint " + input.effectiveHint);
			}
		}
		if (input.reviewNextAt !== void 0) record.review.nextAt = input.reviewNextAt;
		if (input.reviewInterval !== void 0) record.review.interval = input.reviewInterval;
		if (input.reviewPassed !== void 0) {
			const step = input.reviewPassed ? nextInterval(record.review.interval) : REVIEW_LADDER[0];
			record.review.interval = step;
			record.review.count = input.reviewPassed ? record.review.count + 1 : 0;
			record.review.nextAt = new Date(now.getTime() + step * 864e5).toISOString();
			record.review.history.push(at + " " + (input.reviewPassed ? "pass" : "fail") + " +" + step + "d");
			events.push("review " + (input.reviewPassed ? "pass" : "fail") + " +" + step + "d");
			if (input.reviewPassed && step === REVIEW_LADDER[REVIEW_LADDER.length - 1]) {
				record.status = "mastered";
				events.push("status -> mastered");
			}
		} else if (record.status === "review" && record.review.nextAt === void 0) {
			record.review.interval = REVIEW_LADDER[0];
			record.review.nextAt = new Date(now.getTime() + REVIEW_LADDER[0] * 864e5).toISOString();
			events.push("review scheduled +" + REVIEW_LADDER[0] + "d");
		}
		if (input.workAttempt !== void 0) {
			record.work.attempts.push({
				at,
				answer: input.workAttempt.answer,
				verdict: input.workAttempt.verdict,
				source: "text"
			});
			events.push("work attempt " + input.workAttempt.verdict);
		}
		if (input.hrl !== void 0) events.push(...applyHrl(record, input.hrl, at));
		if (input.handoff !== void 0) events.push(...applyHandoff(record, input.handoff, at));
		if (input.handoffConsume !== void 0) events.push(...consumeHandoff(record, input.handoffConsume, at));
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
/** True when this problem carries a handoff no session has accepted yet. */
function hasPendingHandoff(record) {
	return record.handoff !== void 0 && record.handoff.consumedAt === void 0;
}
/**
* Every problem carrying a handoff nobody accepted yet.
* @param records - readable records.
* @returns the id and package of each pending handoff, newest first.
*/
function pendingHandoffs(records) {
	return records.filter(hasPendingHandoff).map((record) => ({
		id: record.id,
		handoff: record.handoff
	})).sort((left, right) => right.handoff.at.localeCompare(left.handoff.at));
}
/**
* Build the resume package for one problem.
* @param record - the problem.
* @returns statement, handoff, insight and the last answer, nothing else.
*/
function resumeView(record) {
	const session = record.guide.sessions[record.guide.sessions.length - 1];
	const attempt = record.work.attempts[record.work.attempts.length - 1];
	return {
		id: record.id,
		statement: record.statement,
		subject: record.subject,
		status: record.status,
		...record.guide.insight === void 0 ? {} : { insight: record.guide.insight },
		...record.handoff === void 0 ? {} : { handoff: record.handoff },
		...attempt === void 0 ? {} : { lastAttempt: attempt },
		...session?.result === void 0 ? {} : { guideResult: session.result }
	};
}
/** One-line summary used by `bank_list`; a pending handoff is named so the list can offer it. */
function summarizeProblem(record) {
	const statement = record.statement.replace(/\s+/gu, " ").slice(0, 40);
	const pending = hasPendingHandoff(record) && record.handoff !== void 0 ? " -> " + record.handoff.to + " 待接" : "";
	return [
		record.id,
		record.status,
		record.subject,
		record.createdAt.slice(0, 10),
		statement
	].join(" | ") + pending;
}
/**
* When the next review sitting is due, as a millisecond stamp.
* Undefined when the problem has no schedule yet or the stamp is unreadable.
* @param record - the problem.
*/
function reviewDueAt(record) {
	const raw = record.review.nextAt;
	if (raw === void 0 || raw.length === 0) return void 0;
	const at = Date.parse(raw);
	return Number.isNaN(at) ? void 0 : at;
}
/**
* True when a review sitting has come due. mastered/parked never come up again;
* every other status does once its date arrives. Pass an end-of-day stamp to ask
* "还差今天这几小时算不算到期".
* @param record - the problem.
* @param now - the instant to compare against.
*/
function isReviewDue(record, now = /* @__PURE__ */ new Date()) {
	if (record.status === "mastered" || record.status === "parked") return false;
	const at = reviewDueAt(record);
	return at !== void 0 && at <= now.getTime();
}
/**
* Aggregate the whole bank.
* @param records - readable records.
* @param limit - how many stalest problems to report.
*/
function summarizeStats(records, limit = 5) {
	const byStatus = {};
	const bySubject = {};
	let pendingHandoffs = 0;
	for (const record of records) {
		byStatus[record.status] = (byStatus[record.status] ?? 0) + 1;
		bySubject[record.subject] = (bySubject[record.subject] ?? 0) + 1;
		if (hasPendingHandoff(record)) pendingHandoffs += 1;
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
		pendingHandoffs,
		stalest
	};
}
//#endregion
export { AFFECTS, BankError, GUIDE_OUTCOMES, HINT_LEVELS, PAIRING_CHOICES, PAIRING_MATCHES, PROBLEM_STATUSES, REVIEW_LADDER, createProblem, defaultBankDirectory, formatDate, hasPendingHandoff, isGuideOutcome, isProblemStatus, isReviewDue, listProblems, makeProblemId, parseRecord, pendingHandoffs, problemPath, readProblem, resumeView, reviewDueAt, slugSubject, summarizeProblem, summarizeStats, updateProblem };

//# sourceMappingURL=store.js.map