import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
//#region src/store.ts
/**
* Problem-bank storage: one directory per problem under `<DSH_HOME>/bank/problems`.
*
* `<id>/problem.json` holds everything that ever happened to one problem — the
* statement, the guide sessions, attempts, the review schedule and an append-only
* history; `<id>/images/` holds the pictures that came with it, copied out of the
* inbound attachment pipeline so a problem travels as one folder. Files are
* written atomically and read defensively: one broken folder is skipped and
* reported, never a reason to fail a listing.
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
/** Record file inside one problem folder. */
const PROBLEM_FILE = "problem.json";
/** Derived table of contents beside the problem folders. */
const BANK_INDEX_FILE = "index.json";
/** Image folder inside one problem folder. */
const IMAGES_DIR = "images";
/** Source formats accepted for problem pictures, matching the inbound pipeline. */
const PROBLEM_IMAGE_MEDIA_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif"
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
/** Folder of one problem; the id is the folder name. */
function problemDir(directory, id) {
	if (!/^[a-z0-9-]+$/u.test(id)) throw new BankError("题目 id 不合法：" + id, "invalid-id");
	return join(directory, id);
}
/** Path of the record inside one problem folder. */
function problemPath(directory, id) {
	return join(problemDir(directory, id), PROBLEM_FILE);
}
/** File extension for one accepted image type. */
function mediaTypeExtension(mediaType) {
	switch (mediaType) {
		case "image/png": return "png";
		case "image/jpeg": return "jpg";
		case "image/webp": return "webp";
		case "image/gif": return "gif";
		default: throw new BankError("不支持的图片类型：" + mediaType, "invalid-input");
	}
}
/** Relative path one stored image keeps inside its problem folder. */
function imageRelPath(sha256, mediaType) {
	return "images/" + sha256 + "." + mediaTypeExtension(mediaType);
}
function asString(value, field) {
	if (typeof value !== "string") throw new BankError("字段 " + field + " 必须是字符串", "invalid-record");
	return value;
}
function asArray(value, field) {
	if (!Array.isArray(value)) throw new BankError("字段 " + field + " 必须是数组", "invalid-record");
	return value;
}
/** Validate the picture list; an older record's empty list stays valid. */
function parseAttachments(raw) {
	if (!Array.isArray(raw)) throw new BankError("字段 attachments 必须是数组", "invalid-record");
	return raw.map((entry) => {
		if (typeof entry !== "object" || entry === null) throw new BankError("attachments 的条目必须是对象", "invalid-record");
		const value = entry;
		const recorded = asString(value.file, "attachments.file");
		const sha256 = asString(value.sha256, "attachments.sha256");
		const mediaType = asString(value.mediaType, "attachments.mediaType");
		if (!/^images\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/u.test(recorded)) throw new BankError("attachments.file 必须是 images/<sha256>.<ext>：" + recorded, "invalid-record");
		if (!PROBLEM_IMAGE_MEDIA_TYPES.includes(mediaType)) throw new BankError("未知图片类型 " + mediaType, "invalid-record");
		return {
			file: recorded,
			sha256,
			mediaType,
			bytes: typeof value.bytes === "number" ? value.bytes : 0,
			...typeof value.width === "number" ? { width: value.width } : {},
			...typeof value.height === "number" ? { height: value.height } : {},
			addedAt: asString(value.addedAt, "attachments.addedAt")
		};
	});
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
		attachments: parseAttachments(value.attachments ?? []),
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
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		try {
			records.push(parseRecord(JSON.parse(readFileSync(join(directory, entry.name, PROBLEM_FILE), "utf8"))));
		} catch (error) {
			skipped.push({
				file: entry.name,
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
		if (!existsSync(problemDir(directory, candidate))) {
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
		attachments: input.attachments ?? [],
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
	mkdirSync(problemDir(directory, id), { recursive: true });
	await writeFileAtomic(problemPath(directory, id), JSON.stringify(record, null, 2) + "\n", {
		mode: 384,
		dirMode: 448
	});
	await rebuildIndex(directory);
	return record;
}
/**
* Copy one picture into a problem folder and describe it for the record.
*
* The bytes come from the inbound attachment pipeline already normalized, so
* the digest names the stored file and a repeated save is a no-op. The caller
* still has to put the returned entry into `record.attachments`.
* @param directory - bank directory.
* @param id - problem id.
* @param input - normalized bytes, their declared type and pixel size.
* @returns the entry to store in the record.
*/
async function saveProblemImage(directory, id, input) {
	const sha256 = createHash("sha256").update(input.data).digest("hex");
	const file = imageRelPath(sha256, input.mediaType);
	const folder = problemDir(directory, id);
	mkdirSync(join(folder, IMAGES_DIR), { recursive: true });
	const target = join(folder, file);
	if (!existsSync(target)) await writeFileAtomic(target, input.data, {
		mode: 384,
		dirMode: 448
	});
	return {
		file,
		sha256,
		mediaType: input.mediaType,
		bytes: input.data.byteLength,
		...input.width === void 0 ? {} : { width: input.width },
		...input.height === void 0 ? {} : { height: input.height },
		addedAt: (input.now ?? /* @__PURE__ */ new Date()).toISOString()
	};
}
/**
* Read one picture back out of a problem folder.
* @param directory - bank directory.
* @param id - problem id.
* @param attachment - the entry from the record.
* @returns the exact stored bytes.
* @throws a BankError when the file is missing or no longer matches its digest.
*/
function readProblemImage(directory, id, attachment) {
	const target = join(problemDir(directory, id), attachment.file);
	if (!existsSync(target)) throw new BankError("题目图片缺失：" + id + "/" + attachment.file, "not-found");
	const data = readFileSync(target);
	if (createHash("sha256").update(data).digest("hex") !== attachment.sha256) throw new BankError("题目图片与记录不符：" + id + "/" + attachment.file, "corrupt");
	return data;
}
/**
* Copy pictures into one problem folder and record them, under the same lock an update takes.
*
* Entries already recorded with the same digest are left alone, so re-running with
* the same picture adds nothing.
* @param directory - bank directory.
* @param id - problem id.
* @param images - normalized bytes in the order they arrived.
* @returns the updated record.
*/
async function attachProblemImages(directory, id, images) {
	if (images.length === 0) return readProblem(directory, id);
	return withFileLock(join(problemDir(directory, id), ".lock"), async () => {
		const record = readProblem(directory, id);
		const at = (/* @__PURE__ */ new Date()).toISOString();
		const events = [];
		for (const image of images) {
			const entry = await saveProblemImage(directory, id, image);
			if (record.attachments.some((existing) => existing.sha256 === entry.sha256)) continue;
			record.attachments.push(entry);
			events.push("image " + entry.sha256.slice(0, 12));
		}
		if (events.length === 0) return record;
		record.updatedAt = at;
		for (const event of events) record.history.push({
			at,
			event
		});
		await writeFileAtomic(problemPath(directory, id), JSON.stringify(record, null, 2) + "\n", {
			mode: 384,
			dirMode: 448
		});
		return record;
	});
}
/**
* Move `problems/<id>.json` records into `problems/<id>/problem.json` once.
*
* Idempotent and non-destructive: the legacy file is renamed to `.migrated`
* only after the new record reads back with the same id, and anything that
* cannot be moved is left exactly where it is.
* @param directory - bank directory.
* @returns the ids that moved and the files that stayed, with reasons.
*/
function migrateLegacyProblems(directory) {
	const result = {
		migrated: [],
		skipped: []
	};
	if (!existsSync(directory)) return result;
	for (const entry of readdirSync(directory, { withFileTypes: true })) if (!entry.isDirectory() && entry.name.endsWith(".json") && entry.name !== "index.json") {
		const file = entry.name;
		const id = file.slice(0, -5);
		if (!/^[a-z0-9-]+$/u.test(id)) {
			result.skipped.push({
				file,
				reason: "不是合法的题目 id"
			});
			continue;
		}
		const legacy = join(directory, file);
		if (existsSync(problemPath(directory, id))) {
			renameSync(legacy, legacy + ".migrated");
			result.skipped.push({
				file,
				reason: "目标文件夹已存在，旧文件改名为 .migrated"
			});
			continue;
		}
		let raw;
		try {
			raw = JSON.parse(readFileSync(legacy, "utf8"));
		} catch (error) {
			result.skipped.push({
				file,
				reason: error instanceof Error ? error.message : String(error)
			});
			continue;
		}
		try {
			const record = parseRecord(raw);
			if (record.id !== id) throw new BankError("记录里的 id 与文件名不一致：" + record.id, "invalid-record");
			mkdirSync(problemDir(directory, id), { recursive: true });
			const target = problemPath(directory, id);
			if (!existsSync(target)) writeFileSync(target, JSON.stringify(record, null, 2) + "\n");
			const readBack = readProblem(directory, id);
			if (readBack.id !== id) throw new BankError("迁移后读回的 id 不对：" + readBack.id, "invalid-record");
			renameSync(legacy, legacy + ".migrated");
			result.migrated.push(id);
		} catch (error) {
			result.skipped.push({
				file,
				reason: error instanceof Error ? error.message : String(error)
			});
		}
	}
	return result;
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
	return withFileLock(join(problemDir(directory, id), ".lock"), async () => {
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
/** Path of the bank index inside the problem directory. */
function indexPath(directory) {
	return join(directory, BANK_INDEX_FILE);
}
/**
* Read the index, or nothing when it is missing or unreadable.
* @param directory - bank directory.
* @returns the index, if it parses.
*/
function readBankIndex(directory) {
	const file = indexPath(directory);
	if (!existsSync(file)) return void 0;
	try {
		const raw = JSON.parse(readFileSync(file, "utf8"));
		if (raw["schema"] !== 1 || !Array.isArray(raw["problems"])) return void 0;
		return {
			schema: 1,
			updatedAt: typeof raw["updatedAt"] === "string" ? raw["updatedAt"] : "",
			problems: raw["problems"].filter((id) => typeof id === "string")
		};
	} catch {
		return;
	}
}
/**
* Rewrite the index from the directory listing.
*
* The index is a cache, never a source of truth: it carries ids only, rebuilds
* in one `readdir`, and losing it costs one extra scan. Call it after a create
* and at mount; a stale entry can never hide or invent a problem.
* @param directory - bank directory.
* @param now - clock injection for tests.
* @returns the index just written.
*/
async function rebuildIndex(directory, now = /* @__PURE__ */ new Date()) {
	const problems = existsSync(directory) ? readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort() : [];
	const index = {
		schema: 1,
		updatedAt: now.toISOString(),
		problems
	};
	mkdirSync(directory, { recursive: true });
	await writeFileAtomic(indexPath(directory), JSON.stringify(index, null, 2) + "\n", {
		mode: 384,
		dirMode: 448
	});
	return index;
}
/** True when the index already names exactly these ids. */
function indexIsCurrent(index, ids) {
	if (index === void 0 || index.problems.length !== ids.length) return false;
	return index.problems.every((id, position) => id === ids[position]);
}
//#endregion
export { AFFECTS, BANK_INDEX_FILE, BankError, GUIDE_OUTCOMES, HINT_LEVELS, IMAGES_DIR, PAIRING_CHOICES, PAIRING_MATCHES, PROBLEM_FILE, PROBLEM_IMAGE_MEDIA_TYPES, PROBLEM_STATUSES, REVIEW_LADDER, attachProblemImages, createProblem, defaultBankDirectory, formatDate, hasPendingHandoff, imageRelPath, indexIsCurrent, indexPath, isGuideOutcome, isProblemStatus, isReviewDue, listProblems, makeProblemId, mediaTypeExtension, migrateLegacyProblems, parseRecord, pendingHandoffs, problemDir, problemPath, readBankIndex, readProblem, readProblemImage, rebuildIndex, resumeView, reviewDueAt, saveProblemImage, slugSubject, summarizeProblem, summarizeStats, updateProblem };

//# sourceMappingURL=store.js.map