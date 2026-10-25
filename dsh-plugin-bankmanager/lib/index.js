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
//#region src/api.ts
/** Body size bound of one JSON request. */
const MAX_BODY_BYTES = 65536;
/** Route prefix owned by this plugin. */
const ROUTE_PREFIX = "/bank/api";
var BankApiError = class extends Error {
	code;
	status;
	constructor(code, message, status = 400) {
		super(message);
		this.code = code;
		this.status = status;
		this.name = "BankApiError";
	}
};
function writeJson(res, status, body) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}
function writeError(res, error) {
	if (error instanceof BankApiError) {
		writeJson(res, error.status, {
			ok: false,
			error: {
				code: error.code,
				message: error.message
			}
		});
		return;
	}
	if (error instanceof BankError) {
		writeJson(res, 400, {
			ok: false,
			error: {
				code: error.code,
				message: error.message
			}
		});
		return;
	}
	writeJson(res, 500, {
		ok: false,
		error: {
			code: "internal",
			message: error instanceof Error ? error.message : String(error)
		}
	});
}
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = Buffer.from(chunk);
		total += buffer.length;
		if (total > MAX_BODY_BYTES) throw new BankApiError("bad-request", "request body too large");
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim() === "") return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new BankApiError("bad-request", "request body is not valid JSON");
	}
}
function header(headers, name) {
	const value = headers[name];
	return typeof value === "string" ? value : void 0;
}
function parseAuthority(authority) {
	try {
		return new URL("http://" + authority);
	} catch {
		return;
	}
}
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255);
}
/**
* Whether one request may reach the plugin routes.
* @param request - inbound request headers.
* @param trustedHosts - hosts the Host already trusts for its own API.
* @returns true for loopback or trusted authority, same-origin only.
*/
function isTrusted(request, trustedHosts) {
	const host = header(request.headers, "host");
	if (host === void 0) return false;
	const hostUrl = parseAuthority(host);
	if (hostUrl === void 0) return false;
	if (!(isLoopbackHostname(hostUrl.hostname) || trustedHosts.some((entry) => {
		const entryUrl = parseAuthority(entry);
		return entryUrl !== void 0 && entryUrl.host === hostUrl.host;
	}))) return false;
	if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
	const origin = header(request.headers, "origin");
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
/**
* Every problem whose handoff nobody accepted yet, newest first.
* @param directory - bank directory.
* @returns the card-shaped pending rows.
*/
function pendingRows(directory) {
	const { records } = listProblems(directory);
	const rows = [];
	for (const entry of pendingHandoffs(records)) {
		const record = records.find((candidate) => candidate.id === entry.id);
		if (record === void 0) continue;
		rows.push({
			id: record.id,
			subject: record.subject,
			status: record.status,
			statement: record.statement,
			handoff: entry.handoff
		});
	}
	return rows;
}
/**
* Mount the browser data channel.
* @param ctx - profile-root context.
* @param directory - bank directory the client reads and writes through this route.
*/
function mountBankApi(ctx, directory) {
	const host = ctx;
	if (typeof host.get !== "function" || typeof host.effect !== "function") return;
	const webServer = host.get("webServer");
	const webStartup = host.get("webStartup");
	if (webServer === void 0 || webStartup === void 0) return;
	const api = {
		"handoff.pending": () => pendingRows(directory),
		"handoff.consume": async (payload) => {
			const id = typeof payload.id === "string" ? payload.id : "";
			const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
			if (id === "") throw new BankApiError("bad-request", "missing or invalid \"id\"");
			if (sessionId === "") throw new BankApiError("bad-request", "missing or invalid \"sessionId\"");
			const record = await updateProblem(directory, id, { handoffConsume: sessionId });
			return {
				id: record.id,
				consumedAt: record.handoff?.consumedAt ?? null,
				consumerSessionId: record.handoff?.consumerSessionId ?? null
			};
		}
	};
	const fence = (req) => isTrusted(req, webStartup.trustedHosts);
	host.effect(() => webServer.register({
		kind: "prefix",
		path: ROUTE_PREFIX,
		handler: async (rawReq, rawRes) => {
			const req = rawReq;
			const res = rawRes;
			if (!fence(req)) {
				writeJson(res, 403, {
					ok: false,
					error: {
						code: "forbidden",
						message: "forbidden"
					}
				});
				return;
			}
			if (req.method !== "POST") {
				writeJson(res, 405, {
					ok: false,
					error: {
						code: "method-error",
						message: "method not allowed"
					}
				});
				return;
			}
			const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
			const method = pathname.startsWith("/bank/api/") ? pathname.slice(10) : void 0;
			if (method === void 0 || method.includes("/")) {
				writeError(res, new BankApiError("not-found", "unknown bank API method", 404));
				return;
			}
			try {
				const payload = await readJsonBody(req);
				const handler = api[method];
				if (handler === void 0) throw new BankApiError("not-found", "unknown bank API method \"" + method + "\"", 404);
				writeJson(res, 200, {
					ok: true,
					value: await handler(payload ?? {})
				});
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "dsh-plugin-bankmanager: /bank/api routes");
}
//#endregion
//#region src/index.ts
/** Cordis plugin name. */
const name = "plugin-bankmanager";
/**
* Services used by this row. Only the tool registry is required: the browser channel's
* web pair (`webServer` / `webStartup`) arrives through a nested inject, so a profile
* without the web-app bundle still gets every tool instead of a permanently pending row.
*/
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
	const scoped = ctx;
	if (typeof scoped.inject === "function") scoped.inject(["webServer", "webStartup"], (webCtx) => {
		mountBankApi(webCtx, directory);
	});
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
			"更新一道题。显式字段：status、guideOutcome（solved / stuck / abandoned）、whereStuck、guideResult、insight、reviewNextAt、reviewInterval、reviewPassed。",
			"判过（status 变 review）会自动排第一次复习；之后每复习一次用 reviewPassed 报结果：true 升一档 1/3/7/14/30/60/120 天，false 回第一档，爬到最后一档自动 mastered。",
			"affect（frustrated / neutral / excited）与 effectiveHint（confirm / position / feature / structure / result）记这一轮的学生状态和哪个档的视角有效，写进当前引导会话。",
			"workAttempt：交一次卷——answer 原文 + verdict（ok / partial / wrong）。只放学生独立做的卷；引导里做出来的写 guideResult。",
			"hrl：答案优化的增量写入，四段都可选，按 input → teacher → step → result 的顺序应用。",
			"  input 是这次在打磨哪份答案；teacher 是教师轨迹（一次写全，按学生偏好写）；",
			"  step 是一个小步的对比，写进最近一个还没有 result 的 pairing；result 是这条 pairing 拼好的最终解。",
			"  每 3 步落一次盘，pairing 结束必须写 result。",
			"handoff：交接包（from / to / why / state / detail）。同一道题最多一个未接收的，新的会顶掉旧的。",
			"handoffConsume：传会话 id 表示这份交接已被接收；传空字符串表示撤销接收，卡片重新可点。",
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
			guideResult: {
				type: "string",
				description: "引导结束时他自己写出来的原稿"
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
			reviewPassed: {
				type: "boolean",
				description: "一次复习的结果：true 升一档（1/3/7/14/30/60/120 天），false 回第一档"
			},
			affect: {
				type: "string",
				description: "这一轮学生的状态：frustrated / neutral / excited"
			},
			effectiveHint: {
				type: "string",
				description: "这一轮哪个档的视角有效：confirm / position / feature / structure / result"
			},
			workAttempt: {
				type: "object",
				additionalProperties: false,
				description: "记录一次独立作答",
				properties: {
					answer: {
						type: "string",
						required: true,
						description: "学生原文"
					},
					verdict: {
						type: "string",
						required: true,
						description: "ok / partial / wrong"
					}
				}
			},
			hrl: {
				type: "object",
				additionalProperties: false,
				description: "答案优化的增量写入",
				properties: {
					input: {
						type: "object",
						additionalProperties: false,
						description: "这次打磨的是哪份答案",
						properties: {
							at: {
								type: "string",
								description: "ISO 时间，省略用当前时间"
							},
							from: {
								type: "string",
								description: "work（从题库带的）或 pasted（学生当场贴的）"
							},
							attemptAt: {
								type: "string",
								description: "对应 work.attempts 里的 at"
							},
							answer: {
								type: "string",
								required: true,
								description: "原文"
							}
						}
					},
					teacher: {
						type: "object",
						additionalProperties: false,
						description: "教师轨迹，一次写全",
						properties: {
							writtenAt: {
								type: "string",
								description: "ISO 时间，省略用当前时间"
							},
							answer: {
								type: "string",
								required: true,
								description: "教师版最终答案"
							},
							note: {
								type: "string",
								description: "按什么偏好写的，可省略"
							},
							steps: {
								type: "array",
								description: "按步拆开的全解",
								items: {
									type: "object",
									additionalProperties: false,
									properties: {
										index: {
											type: "integer",
											required: true
										},
										body: {
											type: "string",
											required: true,
											description: "这一步做什么"
										},
										reason: {
											type: "string",
											required: true,
											description: "为什么能这么做"
										}
									}
								}
							}
						}
					},
					step: {
						type: "object",
						additionalProperties: false,
						description: "一个小步的对比",
						properties: {
							index: {
								type: "integer",
								required: true
							},
							studentQuote: {
								type: "string",
								description: "学生原句，逐字"
							},
							teacherStep: {
								type: "integer",
								description: "对应教师轨迹的 index"
							},
							match: {
								type: "string",
								required: true,
								description: "same / partial / missing"
							},
							chosen: {
								type: "string",
								description: "student / teacher / merged"
							},
							mergedText: {
								type: "string",
								description: "chosen=merged 时学生自己重写的这步"
							},
							chosenAt: {
								type: "string",
								description: "ISO 时间"
							},
							note: {
								type: "string",
								description: "为什么这么选"
							}
						}
					},
					result: {
						type: "string",
						description: "这条 pairing 逐条选完后拼出的解"
					}
				}
			},
			handoff: {
				type: "object",
				additionalProperties: false,
				description: "给下一个模式的交接包",
				properties: {
					id: {
						type: "string",
						description: "省略则自动生成"
					},
					from: {
						type: "string",
						required: true,
						description: "work / guide / hrl / setup"
					},
					to: {
						type: "string",
						required: true,
						description: "目标模式"
					},
					why: {
						type: "string",
						required: true,
						description: "一句话，为什么换"
					},
					state: {
						type: "string",
						required: true,
						description: "这题到哪了"
					},
					detail: {
						type: "object",
						additionalProperties: false,
						description: "三段散文，给下一个模式的你",
						properties: {
							lastWords: {
								type: "string",
								description: "学生最后说了什么"
							},
							blocker: {
								type: "string",
								description: "卡点"
							},
							nextStep: {
								type: "string",
								description: "下一步从哪接"
							}
						}
					}
				}
			},
			handoffConsume: {
				type: "string",
				description: "接受这份交接的会话 id；空字符串表示撤销接收"
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
				const now = (/* @__PURE__ */ new Date()).toISOString();
				const workAttempt = args.workAttempt === void 0 ? void 0 : {
					answer: args.workAttempt.answer,
					verdict: args.workAttempt.verdict
				};
				let hrl;
				if (args.hrl !== void 0) {
					const source = args.hrl;
					hrl = {};
					if (source.input !== void 0) hrl.input = {
						at: source.input.at ?? now,
						from: source.input.from ?? "pasted",
						answer: source.input.answer,
						...source.input.attemptAt === void 0 ? {} : { attemptAt: source.input.attemptAt }
					};
					if (source.teacher !== void 0) hrl.teacher = {
						writtenAt: source.teacher.writtenAt ?? now,
						answer: source.teacher.answer,
						steps: source.teacher.steps ?? [],
						...source.teacher.note === void 0 ? {} : { note: source.teacher.note }
					};
					if (source.step !== void 0) {
						const step = source.step;
						hrl.step = {
							index: step.index,
							match: step.match,
							...step.studentQuote === void 0 ? {} : { studentQuote: step.studentQuote },
							...step.teacherStep === void 0 ? {} : { teacherStep: step.teacherStep },
							...step.chosen === void 0 ? {} : { chosen: step.chosen },
							...step.mergedText === void 0 ? {} : { mergedText: step.mergedText },
							...step.chosenAt === void 0 ? {} : { chosenAt: step.chosenAt },
							...step.note === void 0 ? {} : { note: step.note }
						};
					}
					if (source.result !== void 0) hrl.result = source.result;
				}
				const handoff = args.handoff === void 0 ? void 0 : {
					from: args.handoff.from,
					to: args.handoff.to,
					why: args.handoff.why,
					state: args.handoff.state,
					...args.handoff.id === void 0 ? {} : { id: args.handoff.id },
					...args.handoff.detail === void 0 ? {} : { detail: args.handoff.detail }
				};
				const record = await updateProblem(directory, args.id, {
					...args.status === void 0 ? {} : { status: args.status },
					...args.guideOutcome === void 0 ? {} : { guideOutcome: args.guideOutcome },
					...args.whereStuck === void 0 ? {} : { whereStuck: args.whereStuck },
					...args.guideResult === void 0 ? {} : { guideResult: args.guideResult },
					...args.insight === void 0 ? {} : { insight: args.insight },
					...args.reviewNextAt === void 0 ? {} : { reviewNextAt: args.reviewNextAt },
					...args.reviewInterval === void 0 ? {} : { reviewInterval: args.reviewInterval },
					...args.reviewPassed === void 0 ? {} : { reviewPassed: args.reviewPassed },
					...args.affect === void 0 ? {} : { affect: args.affect },
					...args.effectiveHint === void 0 ? {} : { effectiveHint: args.effectiveHint },
					...workAttempt === void 0 ? {} : { workAttempt },
					...hrl === void 0 ? {} : { hrl },
					...handoff === void 0 ? {} : { handoff },
					...args.handoffConsume === void 0 ? {} : { handoffConsume: args.handoffConsume },
					...args.patch === void 0 ? {} : { patch: args.patch }
				});
				return "已更新 " + record.id + "：状态 " + record.status + "，历史 " + record.history.length + " 条。";
			} catch (error) {
				return explain(error);
			}
		}
	}));
	ctx.tools.register(defineTool({
		name: "bank_resume",
		description: [
			"接上一道题。不给 id：列出所有待接的交接（谁留的、留给谁、为什么、这题到哪了）。",
			"给 id：直接返回那道题的题干、交接包、insight 和最后一次作答——学生说「接着上次那道题」时用这个，别让他重讲题干。",
			"新会话开场先不带 id 调一次，看不到「待接」就说明没有要接的。"
		].join("\n"),
		parameters: { id: {
			type: "string",
			description: "题目 id；省略则只列待接交接"
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
				if (args.id === void 0 || args.id.length === 0) {
					const { records } = listProblems(directory);
					const pending = pendingHandoffs(records);
					if (pending.length === 0) return "没有待接的交接。";
					return pending.map((entry) => {
						const handoff = entry.handoff;
						return "- " + entry.id + "：" + handoff.from + " -> " + handoff.to + "｜" + handoff.why + "｜" + handoff.state;
					}).join("\n");
				}
				return json(resumeView(readProblem(directory, args.id)));
			} catch (error) {
				return explain(error);
			}
		}
	}));
	ctx.tools.register(defineTool({
		name: "bank_stats",
		description: ["题库概况：各状态计数、总数、待接交接数、最久没动的 5 道题。", "用在：学生问「我还有多少题没做」，或者你判断先带哪道题。"].join("\n"),
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
					"待接交接：" + stats.pendingHandoffs,
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