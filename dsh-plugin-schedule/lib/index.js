import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import { defaultBankDirectory, listProblems } from "dsh-plugin-bankmanager/store";
import { createBookStore } from "dsh-plugin-textbook/data";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
//#region src/dates.ts
/**
* Local-date helpers.
*
* Everything in this package speaks `YYYY-MM-DD` in local time: a schoolday is a
* calendar day, not an instant, so there are no ISO timestamps and no time-zone
* arithmetic here. Arithmetic runs on UTC midnights so DST cannot shift a day.
* @module dsh-plugin-schedule/dates
*/
/** Strict `YYYY-MM-DD` shape. */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const MS_PER_DAY = 864e5;
const WEEKDAY_NAMES = [
	"周一",
	"周二",
	"周三",
	"周四",
	"周五",
	"周六",
	"周日"
];
/** Format a calendar date the way the whole package writes it. */
function formatLocalDate(date = /* @__PURE__ */ new Date()) {
	return joinDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}
function joinDate(year, month, day) {
	return String(year) + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}
function formatStamp(stamp) {
	const date = new Date(stamp);
	return joinDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}
/** The UTC midnight of a calendar date, or undefined when the value is not one. */
function stampOf(value) {
	const match = DATE_PATTERN.exec(value);
	if (match === null) return void 0;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const stamp = Date.UTC(year, month - 1, day);
	const check = new Date(stamp);
	if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return;
	return stamp;
}
/** True when the value is a real calendar date written `YYYY-MM-DD`. */
function isValidDate(value) {
	return stampOf(value) !== void 0;
}
/** Shift a calendar date by whole days; negative numbers go backwards. */
function addDays(value, days) {
	const stamp = stampOf(value);
	if (stamp === void 0) throw new RangeError("不是日期（要 YYYY-MM-DD）：" + value);
	return formatStamp(stamp + days * MS_PER_DAY);
}
/** Whole days from `from` to `to`; negative when `to` is earlier. */
function daysBetween(from, to) {
	const start = stampOf(from);
	const end = stampOf(to);
	if (start === void 0) throw new RangeError("不是日期（要 YYYY-MM-DD）：" + from);
	if (end === void 0) throw new RangeError("不是日期（要 YYYY-MM-DD）：" + to);
	return Math.round((end - start) / MS_PER_DAY);
}
/** ISO weekday of a calendar date: Monday 1 … Sunday 7. */
function weekdayOf(value) {
	const stamp = stampOf(value);
	if (stamp === void 0) throw new RangeError("不是日期（要 YYYY-MM-DD）：" + value);
	return (new Date(stamp).getUTCDay() + 6) % 7 + 1;
}
/** Chinese name of an ISO weekday. */
function weekdayName(weekday) {
	return WEEKDAY_NAMES[weekday - 1] ?? "";
}
/** The `YYYY-MM-DD` head of an ISO timestamp, or undefined when it has none. */
function datePart(value) {
	if (value === void 0) return void 0;
	const head = value.slice(0, 10);
	return isValidDate(head) ? head : void 0;
}
const HINT_PREVIEW = "先翻到这一段，自己提两个问题：它在定义什么，它和上一节哪个结论接着。别急着看例题答案。";
const HINT_NO_TEXTBOOK = "教材没绑定或者读不到页数，先按章节标题翻书。";
function subjectNameOf(state, id) {
	return state.subjects.find((subject) => subject.id === id)?.name ?? id;
}
function subjectOrder(state, id) {
	const index = state.subjects.findIndex((subject) => subject.id === id);
	return index < 0 ? state.subjects.length : index;
}
function isDayOff(state, date, subjectId) {
	return state.exceptions.some((exception) => exception.date === date && (exception.kind === "holiday" || exception.kind === "exam") && (exception.subject === void 0 || exception.subject === subjectId));
}
/**
* The next day that actually runs, and the lessons still standing on it.
* Holidays and exam days drop out; a subject-scoped exception only drops that subject.
* @param state - the record.
* @param today - local YYYY-MM-DD.
* @returns the first usable day within PLAN_WINDOW_DAYS, or undefined.
*/
function nextLessonDay(state, today) {
	for (let offset = 0; offset <= 14; offset += 1) {
		const date = addDays(today, offset);
		const weekday = weekdayOf(date);
		const lessons = state.timetable.weekly.filter((lesson) => lesson.weekday === weekday);
		if (lessons.length === 0) continue;
		const open = lessons.filter((lesson) => !isDayOff(state, date, lesson.subject));
		if (open.length === 0) continue;
		return {
			date,
			lessons: open
		};
	}
}
function dayLabel(date, today) {
	const gap = daysBetween(today, date);
	if (gap === 0) return "今天";
	if (gap === 1) return "明天";
	return weekdayName(weekdayOf(date));
}
function pagesLabel(from, to) {
	return from === to ? String(from) : String(from) + "–" + String(to);
}
/** Sections one lesson covers, starting after whatever was recorded. */
function advanceSections(state, subjectId, reader) {
	const bookId = state.subjects.find((item) => item.id === subjectId)?.bookId;
	if (reader === void 0) return {
		sections: [],
		gap: "教材库不可用，只能按章节标题走。"
	};
	if (bookId === void 0 || bookId.length === 0) return {
		sections: [],
		gap: "这个科目还没绑定教材（subjects 的 bookId），给不出页数。"
	};
	const pace = state.pace[subjectId]?.perLesson ?? 1;
	const recorded = state.progress[subjectId]?.section;
	const sections = [];
	let cursor = recorded;
	for (let step = 0; step < pace; step += 1) {
		const next = cursor === void 0 || cursor.length === 0 ? reader.startSection(bookId) : reader.nextSection(bookId, cursor);
		if (next === void 0) return {
			sections,
			gap: cursor === void 0 || cursor.length === 0 ? "这本书里找不到第一节（bookId: " + bookId + "）。" : "进度里的「" + cursor + "」在教材里没找到，或者已经是最后一节。"
		};
		sections.push(next);
		cursor = next.title;
	}
	return {
		sections,
		gap: void 0
	};
}
function wrongCount(problem) {
	return (problem.work?.attempts ?? []).filter((attempt) => attempt.verdict === "wrong").length;
}
function alive(problem) {
	return problem.status !== "mastered" && problem.status !== "parked";
}
function dueDate(problem) {
	const nextAt = problem.review?.nextAt;
	return nextAt === void 0 ? void 0 : datePart(nextAt);
}
function lastTouched(problem) {
	return datePart(problem.updatedAt) ?? datePart(problem.createdAt);
}
/**
* Build today's plan.
* @param state - the schedule record.
* @param deps - bank, textbook, today and the minutes budget.
* @returns the four blocks plus the notes that explain what is missing.
*/
function plan(state, deps) {
	const notes = [];
	const budget = Math.max(1, Math.floor(deps.minutes / 8));
	if (state.timetable.weekly.length === 0) notes.push("还没录课表（schedule_update 的 weekly）——先录课表和进度；复习这块现在就能用，下面照常列。");
	if (state.subjects.length === 0) notes.push("还没有科目（schedule_update 的 subjects）。");
	const day = nextLessonDay(state, deps.today);
	const upcoming = [];
	const prep = [];
	for (const lesson of day?.lessons ?? []) {
		const { sections, gap } = advanceSections(state, lesson.subject, deps.textbook);
		const recorded = state.progress[lesson.subject]?.section;
		const bookId = state.subjects.find((item) => item.id === lesson.subject)?.bookId ?? "";
		const book = deps.textbook?.book(bookId);
		const lessonDate = day === void 0 ? deps.today : day.date;
		upcoming.push({
			date: lessonDate,
			dayLabel: dayLabel(lessonDate, deps.today),
			weekday: lesson.weekday,
			slot: lesson.slot,
			subjectId: lesson.subject,
			subjectName: subjectNameOf(state, lesson.subject),
			from: recorded,
			to: sections.at(-1)?.title,
			sections: sections.map((section) => section.title),
			note: lesson.note,
			gap
		});
		const first = sections.at(0);
		if (first === void 0) continue;
		if (book === void 0) {
			prep.push({
				subjectId: lesson.subject,
				subjectName: subjectNameOf(state, lesson.subject),
				bookTitle: "（教材未绑定）",
				section: first.title,
				pdfPages: pagesLabel(first.pdfPage, first.endPage),
				bookPages: void 0,
				hint: HINT_NO_TEXTBOOK
			});
			continue;
		}
		const start = first.pdfPage - book.textbookOffset;
		const end = first.endPage - book.textbookOffset;
		prep.push({
			subjectId: lesson.subject,
			subjectName: subjectNameOf(state, lesson.subject),
			bookTitle: book.title,
			section: first.title,
			pdfPages: pagesLabel(first.pdfPage, first.endPage),
			bookPages: pagesLabel(start, end),
			hint: HINT_PREVIEW
		});
	}
	if (day === void 0 && state.timetable.weekly.length > 0) notes.push("往后 " + String(14) + " 天里没有能上的课（假期或者空档），先按复习走。");
	const recordedCount = state.subjects.filter((subject) => state.progress[subject.id] !== void 0).length;
	if (state.subjects.length > 0 && recordedCount === 0) notes.push("还没录进度（schedule_update 的 progress）——不知道讲到哪一节，只能给到这个课的排期。");
	const records = deps.bank === void 0 ? [] : deps.bank.list().records;
	const live = records.filter(alive);
	const listed = /* @__PURE__ */ new Set();
	const queue = live.map((problem) => ({
		problem,
		due: dueDate(problem)
	})).filter((item) => item.due !== void 0 && item.due <= deps.today).sort((left, right) => left.due.localeCompare(right.due) || subjectOrder(state, left.problem.subject) - subjectOrder(state, right.problem.subject) || left.problem.id.localeCompare(right.problem.id)).map((item) => ({
		id: item.problem.id,
		subject: item.problem.subject,
		reason: "due",
		why: "到期（" + item.due + "）"
	}));
	for (const item of queue) listed.add(item.id);
	const wrong = live.filter((problem) => !listed.has(problem.id) && wrongCount(problem) > 0).sort((left, right) => subjectOrder(state, left.subject) - subjectOrder(state, right.subject) || left.id.localeCompare(right.id));
	for (const problem of wrong) {
		queue.push({
			id: problem.id,
			subject: problem.subject,
			reason: "wrong",
			why: "上次做错了（错了 " + String(wrongCount(problem)) + " 次）"
		});
		listed.add(problem.id);
	}
	const stuck = live.filter((problem) => !listed.has(problem.id) && (problem.status === "guide" || problem.status === "hrl")).sort((left, right) => subjectOrder(state, left.subject) - subjectOrder(state, right.subject) || left.id.localeCompare(right.id));
	for (const problem of stuck) {
		queue.push({
			id: problem.id,
			subject: problem.subject,
			reason: "stuck",
			why: "停在 " + problem.status + " 没走完"
		});
		listed.add(problem.id);
	}
	const review = queue.slice(0, budget);
	const reviewOverflow = queue.length - review.length;
	if (records.length === 0 && deps.bank !== void 0) notes.push("题库还是空的，没有可复习的题。");
	const leftover = [];
	for (const problem of live) {
		const wrongs = wrongCount(problem);
		const touched = lastTouched(problem);
		const idle = touched === void 0 ? void 0 : daysBetween(touched, deps.today);
		if (wrongs >= 2) {
			leftover.push({
				id: problem.id,
				subject: problem.subject,
				reason: "wrong-twice",
				why: "同一道错了 " + String(wrongs) + " 次"
			});
			continue;
		}
		if (idle !== void 0 && idle > 14) leftover.push({
			id: problem.id,
			subject: problem.subject,
			reason: "stale",
			why: "已经 " + String(idle) + " 天没动"
		});
	}
	leftover.sort((left, right) => subjectOrder(state, left.subject) - subjectOrder(state, right.subject) || left.id.localeCompare(right.id));
	return {
		date: deps.today,
		budget,
		upcoming,
		prep,
		review,
		reviewOverflow,
		leftover,
		notes
	};
}
/**
* Render a plan as the text the model reads.
* @param result - the computed plan.
* @returns Chinese text with the four blocks in a fixed order.
*/
function renderPlan(result) {
	const lines = [];
	const weekday = weekdayName(weekdayOf(result.date));
	lines.push("【" + result.date + " " + weekday + "】今天约 " + String(result.budget * 8) + " 分钟的题量预算");
	lines.push("", "一、下一次课讲什么");
	if (result.upcoming.length === 0) lines.push("  课表为空或者后面没有课，先跳到第三块。");
	for (const lesson of result.upcoming) {
		lines.push("  " + lesson.date + " " + lesson.dayLabel + " 第 " + String(lesson.slot) + " 节 · " + lesson.subjectName + (lesson.note === void 0 ? "" : "（" + lesson.note + "）"));
		lines.push("    上次到：" + (lesson.from === void 0 ? "没录" : lesson.from) + " → 这一课讲到：" + (lesson.to === void 0 ? "未知" : lesson.to));
		if (lesson.gap !== void 0) lines.push("    注意：" + lesson.gap);
	}
	lines.push("", "二、今天预习（问题你自己提，这里只给锚点）");
	if (result.prep.length === 0) lines.push("  没有可预习的段落（缺课表、缺进度或者教材没绑定）。");
	for (const anchor of result.prep) {
		lines.push("  " + anchor.subjectName + " · 《" + anchor.bookTitle + "》 " + anchor.section);
		lines.push("    PDF 第 " + anchor.pdfPages + " 页" + (anchor.bookPages === void 0 ? "" : "（课本第 " + anchor.bookPages + " 页）"));
		lines.push("    " + anchor.hint);
	}
	lines.push("", "三、今天复习（按到期 → 上次做错 → 卡住的顺序排）");
	if (result.review.length === 0) lines.push("  今天没有到期的题。");
	for (const item of result.review) lines.push("  " + item.id + " · " + item.subject + " · " + item.why);
	if (result.reviewOverflow > 0) lines.push("  还有 " + String(result.reviewOverflow) + " 道排不进今天，先不动。");
	lines.push("", "四、历史遗留（超过 " + String(14) + " 天没动，或者错了 " + String(2) + " 次以上）");
	if (result.leftover.length === 0) lines.push("  没有。");
	for (const item of result.leftover) lines.push("  " + item.id + " · " + item.subject + " · " + item.why);
	if (result.notes.length > 0) {
		lines.push("", "备注");
		for (const note of result.notes) lines.push("  " + note);
	}
	return lines.join("\n");
}
//#endregion
//#region src/store.ts
/**
* Schedule storage: one JSON file under `<DSH_HOME>/schedule/schedule.json`.
*
* The record holds what a learner can tell us about school — subjects (each may
* point at a textbook), the weekly timetable, how many sections one lesson
* covers, where each subject currently stands, and the days that do not run as
* written (holidays, swaps, exam days).
*
* Writes are atomic (tmp file + rename) and field-level: a patch only touches the
* fields it names. Reads are defensive — a broken file is treated as an empty
* record instead of blocking the learner, and the caller can say so out loud.
* @module dsh-plugin-schedule/store
*/
/** Weekdays run 1 (Monday) through 7 (Sunday). */
const WEEKDAYS = [
	1,
	2,
	3,
	4,
	5,
	6,
	7
];
/** Days the timetable does not run as written. */
const EXCEPTION_KINDS = [
	"holiday",
	"swap",
	"exam"
];
/** Failure with a stable code so the tool can answer in one sentence. */
var ScheduleError = class extends Error {
	code;
	constructor(message, code) {
		super(message);
		this.code = code;
		this.name = "ScheduleError";
	}
};
/** A fresh, empty record. */
function emptySchedule() {
	return {
		schema: 1,
		subjects: [],
		timetable: { weekly: [] },
		pace: {},
		progress: {},
		exceptions: []
	};
}
/**
* Resolve the default schedule file under the Harness home.
* @returns the absolute path.
*/
function defaultScheduleFile() {
	const home = process.env.DSH_HOME?.trim();
	return join(home !== void 0 && home.length > 0 ? home : process.cwd(), "schedule", "schedule.json");
}
/**
* Read the schedule, or an empty one.
* @param file - absolute path.
* @returns the record; a corrupt file yields an empty record rather than a throw.
*/
function loadSchedule(file) {
	if (!existsSync(file)) return {
		state: emptySchedule(),
		corrupted: false
	};
	let raw;
	try {
		raw = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return {
			state: emptySchedule(),
			corrupted: true
		};
	}
	if (typeof raw !== "object" || raw === null) return {
		state: emptySchedule(),
		corrupted: true
	};
	const value = raw;
	if (value.schema !== void 0 && value.schema !== 1) return {
		state: emptySchedule(),
		corrupted: true
	};
	return {
		state: normalizeSchedule(value),
		corrupted: false
	};
}
/** Read just the record. */
function readSchedule(file) {
	return loadSchedule(file).state;
}
function asRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function asArray(value) {
	return Array.isArray(value) ? value : [];
}
function text(value) {
	return typeof value === "string" ? value.trim() : "";
}
/**
* Rebuild a record from parsed JSON, dropping entries that no longer make sense.
* Never throws: a partially readable file still gives a partially usable plan.
*/
function normalizeSchedule(value) {
	const state = emptySchedule();
	const seen = /* @__PURE__ */ new Set();
	for (const entry of asArray(value.subjects)) {
		const item = asRecord(entry);
		if (item === void 0) continue;
		const id = text(item.id);
		const name = text(item.name);
		if (id.length === 0 || name.length === 0 || seen.has(id)) continue;
		seen.add(id);
		const subject = {
			id,
			name
		};
		const bookId = text(item.bookId);
		if (bookId.length > 0) subject.bookId = bookId;
		const note = text(item.note);
		if (note.length > 0) subject.note = note;
		state.subjects.push(subject);
	}
	for (const entry of asArray(asRecord(value.timetable)?.weekly)) {
		const item = asRecord(entry);
		if (item === void 0) continue;
		const weekday = item.weekday;
		const slot = item.slot;
		const subject = text(item.subject);
		if (typeof weekday !== "number" || !WEEKDAYS.includes(weekday)) continue;
		if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 1) continue;
		if (subject.length === 0) continue;
		const lesson = {
			weekday,
			slot,
			subject
		};
		const note = text(item.note);
		if (note.length > 0) lesson.note = note;
		state.timetable.weekly.push(lesson);
	}
	state.timetable.weekly = sortLessons(state.timetable.weekly);
	for (const [key, entry] of Object.entries(asRecord(value.pace) ?? {})) {
		const item = asRecord(entry);
		if (item === void 0) continue;
		const perLesson = item.perLesson;
		if (typeof perLesson !== "number" || !Number.isInteger(perLesson) || perLesson < 1) continue;
		state.pace[key] = { perLesson };
	}
	for (const [key, entry] of Object.entries(asRecord(value.progress) ?? {})) {
		const item = asRecord(entry);
		if (item === void 0) continue;
		const section = text(item.section);
		if (section.length === 0) continue;
		const at = text(item.at);
		state.progress[key] = {
			section,
			at: isValidDate(at) ? at : ""
		};
	}
	for (const entry of asArray(value.exceptions)) {
		const item = asRecord(entry);
		if (item === void 0) continue;
		const date = text(item.date);
		const kind = text(item.kind);
		if (!isValidDate(date)) continue;
		if (!EXCEPTION_KINDS.includes(kind)) continue;
		const exception = {
			date,
			kind
		};
		const subject = text(item.subject);
		if (subject.length > 0) exception.subject = subject;
		const note = text(item.note);
		if (note.length > 0) exception.note = note;
		state.exceptions.push(exception);
	}
	state.exceptions = sortExceptions(state.exceptions);
	const updatedAt = text(value.updatedAt);
	if (isValidDate(updatedAt)) state.updatedAt = updatedAt;
	return state;
}
/** Order lessons by weekday, then slot, then subject id. */
function sortLessons(lessons) {
	return [...lessons].sort((left, right) => left.weekday - right.weekday || left.slot - right.slot || left.subject.localeCompare(right.subject));
}
/** Order exceptions by date, then kind, then subject. */
function sortExceptions(exceptions) {
	return [...exceptions].sort((left, right) => left.date.localeCompare(right.date) || left.kind.localeCompare(right.kind) || (left.subject ?? "").localeCompare(right.subject ?? ""));
}
function needText(value, label) {
	const trimmed = value.trim();
	if (trimmed.length === 0) throw new ScheduleError(label + "不能为空。", "invalid-input");
	return trimmed;
}
function needSubjectId(value) {
	const id = needText(value, "科目 id ");
	if (id.includes("/") || id.includes("\\") || id === "." || id === "..") throw new ScheduleError("科目 id 不能带路径字符：" + id, "invalid-input");
	return id;
}
function needWeekday(value) {
	if (!Number.isInteger(value) || !WEEKDAYS.includes(value)) throw new ScheduleError("weekday 要写 1–7（周一=1，周日=7），收到 " + String(value) + "。", "invalid-input");
	return value;
}
function needSlot(value) {
	if (!Number.isInteger(value) || value < 1) throw new ScheduleError("slot 要是从 1 开始的整数（当天第几节），收到 " + String(value) + "。", "invalid-input");
	return value;
}
function needPace(value) {
	if (!Number.isInteger(value) || value < 1 || value > 10) throw new ScheduleError("pace 要是 1–" + String(10) + " 之间的整数（每次课推进几节），收到 " + String(value) + "。", "invalid-input");
	return value;
}
function needDate(value, label) {
	const trimmed = value.trim();
	if (!isValidDate(trimmed)) throw new ScheduleError(label + "要写成 YYYY-MM-DD，收到 " + trimmed + "。", "invalid-input");
	return trimmed;
}
/**
* Merge one patch into a record without touching the file.
* @param state - the record to start from.
* @param patch - the fields to write.
* @param today - `YYYY-MM-DD` used for `updatedAt` and for progress without `at`.
* @returns the merged record.
*/
function applyPatch(state, patch, today) {
	const subjects = state.subjects.map((subject) => ({ ...subject }));
	const find = (id) => subjects.find((item) => item.id === id);
	const requireSubject = (id) => {
		const found = find(id);
		if (found === void 0) throw new ScheduleError("还没录这个科目：" + id + "（先用 subjects 把它加进来）。", "unknown-subject");
		return found;
	};
	for (const input of patch.subjects ?? []) {
		const id = needSubjectId(input.id);
		const name = needText(input.name, "科目名 ");
		const existing = find(id);
		if (existing === void 0) {
			const subject = {
				id,
				name
			};
			if (input.bookId !== void 0) {
				const bookId = input.bookId.trim();
				if (bookId.length > 0) subject.bookId = bookId;
			}
			if (input.note !== void 0) {
				const note = input.note.trim();
				if (note.length > 0) subject.note = note;
			}
			subjects.push(subject);
			continue;
		}
		existing.name = name;
		if (input.bookId !== void 0) {
			const bookId = input.bookId.trim();
			if (bookId.length > 0) existing.bookId = bookId;
			else delete existing.bookId;
		}
		if (input.note !== void 0) {
			const note = input.note.trim();
			if (note.length > 0) existing.note = note;
			else delete existing.note;
		}
	}
	const removed = /* @__PURE__ */ new Set();
	for (const id of patch.removeSubjects ?? []) {
		const index = subjects.findIndex((item) => item.id === id);
		if (index < 0) continue;
		removed.add(id);
		subjects.splice(index, 1);
	}
	const toLesson = (input) => {
		const lesson = {
			weekday: needWeekday(input.weekday),
			slot: needSlot(input.slot),
			subject: requireSubject(needSubjectId(input.subject)).id
		};
		if (input.note !== void 0) {
			const note = input.note.trim();
			if (note.length > 0) lesson.note = note;
		}
		return lesson;
	};
	let weekly = state.timetable.weekly.map((lesson) => ({ ...lesson }));
	if (patch.weekly !== void 0) weekly = patch.weekly.map(toLesson);
	if (patch.addLessons !== void 0) for (const lesson of patch.addLessons.map(toLesson)) {
		weekly = weekly.filter((item) => item.weekday !== lesson.weekday || item.slot !== lesson.slot);
		weekly.push(lesson);
	}
	if (removed.size > 0) weekly = weekly.filter((lesson) => !removed.has(lesson.subject));
	const pace = { ...state.pace };
	for (const input of patch.pace ?? []) {
		const subject = requireSubject(needSubjectId(input.subject));
		pace[subject.id] = { perLesson: needPace(input.perLesson) };
	}
	const progress = { ...state.progress };
	for (const input of patch.progress ?? []) {
		const subject = requireSubject(needSubjectId(input.subject));
		const section = needText(input.section, "进度（章节）");
		const at = input.at === void 0 ? today : needDate(input.at, "进度日期 ");
		progress[subject.id] = {
			section,
			at
		};
	}
	let exceptions = state.exceptions.map((item) => ({ ...item }));
	for (const key of patch.removeExceptions ?? []) {
		const date = needDate(key.date, "例外日期 ");
		exceptions = exceptions.filter((item) => !(item.date === date && (key.kind === void 0 || item.kind === key.kind) && (key.subject === void 0 || item.subject === key.subject)));
	}
	for (const input of patch.addExceptions ?? []) {
		const date = needDate(input.date, "例外日期 ");
		const kind = input.kind.trim();
		if (!EXCEPTION_KINDS.includes(kind)) throw new ScheduleError("kind 只能是 holiday（放假）/ swap（调课）/ exam（考试日），收到 " + kind + "。", "invalid-input");
		const exception = {
			date,
			kind
		};
		if (input.subject !== void 0 && input.subject.trim().length > 0) exception.subject = requireSubject(input.subject.trim()).id;
		if (input.note !== void 0) {
			const note = input.note.trim();
			if (note.length > 0) exception.note = note;
		}
		if (!exceptions.some((item) => item.date === exception.date && item.kind === exception.kind && item.subject === exception.subject)) exceptions.push(exception);
	}
	for (const id of removed) {
		delete pace[id];
		delete progress[id];
	}
	return {
		schema: 1,
		subjects,
		timetable: { weekly: sortLessons(weekly) },
		pace,
		progress,
		exceptions: sortExceptions(exceptions),
		updatedAt: today
	};
}
/**
* Apply one patch and persist it atomically.
* @param file - absolute path.
* @param patch - the fields to write.
* @param now - clock injection for tests.
* @returns the merged record.
*/
function updateSchedule(file, patch, now = /* @__PURE__ */ new Date()) {
	const next = applyPatch(readSchedule(file), patch, formatLocalDate(now));
	mkdirSync(dirname(file), { recursive: true });
	const temporary = file + ".tmp";
	writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n");
	renameSync(temporary, file);
	return next;
}
//#endregion
//#region src/index.ts
/** Cordis plugin name. */
const name = "plugin-schedule";
/** Only the tool registry is needed: the schedule has no browser half in v1. */
const inject = ["tools"];
/** Runtime schema for the schedule row. */
const Config = z.object({
	/** Absolute schedule file; empty means <DSH_HOME>/schedule/schedule.json. */
	file: z.string().default(""),
	/** Absolute bank directory; empty means <DSH_HOME>/bank/problems. */
	bankDirectory: z.string().default(""),
	/** Absolute textbook corpus directory; empty means the textbook package default. */
	textbookData: z.string().default("")
});
/** Model-facing text for a failure. */
function explain(error) {
	if (error instanceof ScheduleError) return error.code + ": " + error.message;
	return "schedule error: " + (error instanceof Error ? error.message : String(error));
}
function empty(value) {
	return value === void 0 || value.length === 0;
}
/** Build the textbook reader lazily: a missing corpus must not break the row. */
function createTextbookReader(dataDirectory) {
	let cached;
	let loaded = false;
	return () => {
		if (loaded) return cached;
		loaded = true;
		try {
			const store = empty(dataDirectory) ? createBookStore() : createBookStore({ dataDirectory });
			cached = {
				book: (bookId) => {
					try {
						const book = store.readBook(bookId);
						return {
							id: book.id,
							title: book.title,
							textbookOffset: book.textbookOffset
						};
					} catch {
						return;
					}
				},
				startSection: (bookId) => {
					try {
						return store.readBook(bookId).sections.at(0);
					} catch {
						return;
					}
				},
				nextSection: (bookId, afterTitle) => {
					try {
						return store.nextSection(bookId, afterTitle);
					} catch {
						return;
					}
				}
			};
		} catch {
			cached = void 0;
		}
		return cached;
	};
}
function line(label, value) {
	return label + "：" + value;
}
/** Render one part of the record as text. */
function renderRead(state, file, corrupted, part) {
	const lines = [];
	if (corrupted) lines.push("文件读不出来，已经当作空记录：" + file);
	const wanted = part === "all" ? "all" : part;
	if (wanted === "all" || wanted === "subjects") {
		lines.push("【科目】" + String(state.subjects.length) + " 个");
		if (state.subjects.length === 0) lines.push("  还没录科目——schedule_update 的 subjects 可以一次加一个。");
		for (const subject of state.subjects) lines.push("  " + subject.id + " · " + subject.name + (subject.bookId === void 0 ? " · 未绑定教材" : " · 教材 " + subject.bookId) + (subject.note === void 0 ? "" : " · " + subject.note));
	}
	if (wanted === "all" || wanted === "timetable") {
		const weekly = state.timetable.weekly;
		lines.push("【课表】" + String(weekly.length) + " 节/周");
		if (weekly.length === 0) lines.push("  还没录课表——schedule_update 的 weekly 传整份，addLessons 单独加几节。");
		for (const weekday of [
			1,
			2,
			3,
			4,
			5,
			6,
			7
		]) {
			const day = weekly.filter((lesson) => lesson.weekday === weekday);
			if (day.length === 0) continue;
			const slots = day.map((lesson) => "第 " + String(lesson.slot) + " 节 " + lesson.subject + (lesson.note === void 0 ? "" : "（" + lesson.note + "）"));
			lines.push("  " + weekdayName(weekday) + "：" + slots.join("、"));
		}
	}
	if (wanted === "all" || wanted === "pace") {
		lines.push("【节奏】每次课推进几节");
		const ids = Object.keys(state.pace);
		if (ids.length === 0) lines.push("  没设过，默认每课 1 节。");
		for (const id of ids) lines.push("  " + id + "：" + String(state.pace[id]?.perLesson ?? 1) + " 节/课");
	}
	if (wanted === "all" || wanted === "progress") {
		lines.push("【进度】");
		const ids = Object.keys(state.progress);
		if (ids.length === 0) lines.push("  还没录进度——schedule_update 的 progress 写「讲到哪一节」。");
		for (const id of ids) {
			const entry = state.progress[id];
			if (entry === void 0) continue;
			lines.push("  " + id + "：" + entry.section + (entry.at.length === 0 ? "" : "（" + entry.at + " 记）"));
		}
	}
	if (wanted === "all" || wanted === "exceptions") {
		lines.push("【例外】" + String(state.exceptions.length) + " 天");
		if (state.exceptions.length === 0) lines.push("  没有例外。");
		for (const exception of state.exceptions) {
			const kind = exception.kind === "holiday" ? "放假" : exception.kind === "exam" ? "考试日" : "调课";
			lines.push("  " + exception.date + " · " + kind + (exception.subject === void 0 ? " · 整天" : " · 只有 " + exception.subject) + (exception.note === void 0 ? "" : " · " + exception.note));
		}
	}
	if (state.updatedAt !== void 0) lines.push("", "最后更新：" + state.updatedAt);
	lines.push(line("文件", file));
	return lines.join("\n");
}
/**
* Mount the schedule tools on this scope.
* @param ctx - profile-root context; the row registers host-wide tools.
* @param config - where the schedule file, bank and corpus live.
*/
function apply(ctx, config) {
	const file = empty(config.file) ? defaultScheduleFile() : config.file;
	const bankDirectory = empty(config.bankDirectory) ? defaultBankDirectory() : config.bankDirectory;
	const textbook = createTextbookReader(config.textbookData);
	ctx.tools.register(defineTool({
		name: "schedule_read",
		description: [
			"读课表与进度的现状：科目、每周课表、每课推进几节、各科讲到哪一节、以及放假/调课/考试日。",
			"用在：开学第一次见面、学生说「今天该干什么」而你还没看过课表、或者刚改完课表想确认一下。",
			"缺什么会直接说（还没录课表 / 还没录进度），别猜；part 省略等于全部。"
		].join("\n"),
		parameters: { part: {
			type: "string",
			description: "只看一块：all（默认）/ timetable / progress / subjects / pace / exceptions"
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
				const { state, corrupted } = loadSchedule(file);
				const part = args.part === void 0 || args.part.length === 0 ? "all" : args.part;
				return renderRead(state, file, corrupted, part);
			} catch (error) {
				return explain(error);
			}
		}
	}));
	ctx.tools.register(defineTool({
		name: "schedule_update",
		description: [
			"按字段改课表与进度：加/改科目（含绑定的教材 bookId）、换整份课表或单独加几节、设每课推进几节、更新各科讲到哪一节、加删放假/调课/考试日。",
			"用在：学生告诉你课表、说「数学讲到一节半了」、老师调课或者明天放假。",
			"只改你传的字段，没传的原样不动；weekly 是整个星期的替换，addLessons 是单加几节（同一天同一节以新的为准）。",
			"留空字符串等于解绑（bookId、note）；科目 id 一旦用过就别改，进度和课表都挂在它上面。"
		].join("\n"),
		parameters: {
			subjects: {
				type: "array",
				description: "加或改科目；id 已存在就更新名字/教材/备注",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						id: {
							type: "string",
							required: true,
							description: "科目 id，如 math / chem / physics，自由字符串"
						},
						name: {
							type: "string",
							required: true,
							description: "显示名，如 数学"
						},
						bookId: {
							type: "string",
							description: "绑定的教材 id，如 renjiaoA-math-1；空字符串解绑"
						},
						note: {
							type: "string",
							description: "备注，空字符串清除"
						}
					}
				}
			},
			removeSubjects: {
				type: "array",
				description: "删掉这些科目的记录（连同课表里的课、节奏和进度）",
				items: { type: "string" }
			},
			weekly: {
				type: "array",
				description: "整份替换每周课表；传空数组等于清空",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						weekday: {
							type: "integer",
							required: true,
							description: "1–7，周一=1，周日=7"
						},
						slot: {
							type: "integer",
							required: true,
							description: "当天第几节，从 1 开始"
						},
						subject: {
							type: "string",
							required: true,
							description: "科目 id"
						},
						note: {
							type: "string",
							description: "备注（连堂、合班…）"
						}
					}
				}
			},
			addLessons: {
				type: "array",
				description: "只加/改几节；同一天同一节会被替换",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						weekday: {
							type: "integer",
							required: true,
							description: "1–7，周一=1"
						},
						slot: {
							type: "integer",
							required: true,
							description: "当天第几节"
						},
						subject: {
							type: "string",
							required: true,
							description: "科目 id"
						},
						note: {
							type: "string",
							description: "备注"
						}
					}
				}
			},
			pace: {
				type: "array",
				description: "设某个科目每次课推进几节（默认 1）",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						subject: {
							type: "string",
							required: true,
							description: "科目 id"
						},
						perLesson: {
							type: "integer",
							required: true,
							description: "1–10"
						}
					}
				}
			},
			progress: {
				type: "array",
				description: "写某个科目讲到哪一节了；at 省略就是今天",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						subject: {
							type: "string",
							required: true,
							description: "科目 id"
						},
						section: {
							type: "string",
							required: true,
							description: "章节标题，要和教材目录里的写法一致"
						},
						at: {
							type: "string",
							description: " YYYY-MM-DD，省略用今天"
						}
					}
				}
			},
			addExceptions: {
				type: "array",
				description: "加例外日",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						date: {
							type: "string",
							required: true,
							description: "YYYY-MM-DD"
						},
						kind: {
							type: "string",
							required: true,
							description: "holiday（放假）/ swap（调课）/ exam（考试日）"
						},
						subject: {
							type: "string",
							description: "只影响这个科目；省略等于整天"
						},
						note: {
							type: "string",
							description: "说明，比如「调成周六上」"
						}
					}
				}
			},
			removeExceptions: {
				type: "array",
				description: "删例外日；传 date 就删那天的全部，再给 kind / subject 收窄",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						date: {
							type: "string",
							required: true,
							description: "YYYY-MM-DD"
						},
						kind: {
							type: "string",
							description: "holiday / swap / exam"
						},
						subject: {
							type: "string",
							description: "科目 id"
						}
					}
				}
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
				const subjects = args.subjects?.map((item) => ({
					id: item.id,
					name: item.name,
					...item.bookId === void 0 ? {} : { bookId: item.bookId },
					...item.note === void 0 ? {} : { note: item.note }
				}));
				const weekly = args.weekly?.map((item) => ({
					weekday: item.weekday,
					slot: item.slot,
					subject: item.subject,
					...item.note === void 0 ? {} : { note: item.note }
				}));
				const addLessons = args.addLessons?.map((item) => ({
					weekday: item.weekday,
					slot: item.slot,
					subject: item.subject,
					...item.note === void 0 ? {} : { note: item.note }
				}));
				const pace = args.pace?.map((item) => ({
					subject: item.subject,
					perLesson: item.perLesson
				}));
				const progress = args.progress?.map((item) => ({
					subject: item.subject,
					section: item.section,
					...item.at === void 0 ? {} : { at: item.at }
				}));
				const addExceptions = args.addExceptions?.map((item) => ({
					date: item.date,
					kind: item.kind,
					...item.subject === void 0 ? {} : { subject: item.subject },
					...item.note === void 0 ? {} : { note: item.note }
				}));
				const removeExceptions = args.removeExceptions?.map((item) => ({
					date: item.date,
					...item.kind === void 0 ? {} : { kind: item.kind },
					...item.subject === void 0 ? {} : { subject: item.subject }
				}));
				if (!(subjects !== void 0 || args.removeSubjects !== void 0 || weekly !== void 0 || addLessons !== void 0 || pace !== void 0 || progress !== void 0 || addExceptions !== void 0 || removeExceptions !== void 0)) return "没有要更新的字段：至少给一个（subjects / weekly / addLessons / pace / progress / addExceptions…）。";
				const state = updateSchedule(file, {
					...subjects === void 0 ? {} : { subjects },
					...args.removeSubjects === void 0 ? {} : { removeSubjects: args.removeSubjects },
					...weekly === void 0 ? {} : { weekly },
					...addLessons === void 0 ? {} : { addLessons },
					...pace === void 0 ? {} : { pace },
					...progress === void 0 ? {} : { progress },
					...addExceptions === void 0 ? {} : { addExceptions },
					...removeExceptions === void 0 ? {} : { removeExceptions }
				});
				return [
					"已更新（" + state.updatedAt + "）：",
					"科目 " + String(state.subjects.length) + " 个",
					"课表 " + String(state.timetable.weekly.length) + " 节/周",
					"进度 " + String(Object.keys(state.progress).length) + " 条",
					"例外 " + String(state.exceptions.length) + " 天",
					"文件：" + file
				].join("\n");
			} catch (error) {
				return explain(error);
			}
		}
	}));
	ctx.tools.register(defineTool({
		name: "schedule_plan",
		description: [
			"给出今天该做什么，四块：下一次课讲什么、今天预习哪几页、今天复习哪些题、哪些历史遗留该处理。",
			"用在：学生问「今天干什么」、每天开头、或者你说不清该从哪科开始的时候。",
			"只读：不判题、不评价学生、不给出答案，题和页都只是锚点，问题要学生自己提。",
			"课表或进度空着也照样给下一步（复习和历史遗留不依赖课表），并直接说缺什么。",
			"minutes 是今天的题量预算，每题约 8 分钟。"
		].join("\n"),
		parameters: {
			date: {
				type: "string",
				description: "YYYY-MM-DD，省略就是今天（本地日期）"
			},
			minutes: {
				type: "integer",
				description: "今天有多少分钟做题，默认 25"
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
				const today = args.date === void 0 || args.date.length === 0 ? formatLocalDate() : args.date.trim();
				if (!isValidDate(today)) return "invalid-input: date 要写成 YYYY-MM-DD，收到 " + args.date + "。";
				const minutes = args.minutes === void 0 ? 25 : args.minutes;
				if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) return "invalid-input: minutes 要是 1–600 的整数，收到 " + String(args.minutes) + "。";
				const { state, corrupted } = loadSchedule(file);
				let bank;
				const extra = [];
				try {
					const listing = listProblems(bankDirectory);
					const records = listing.records;
					bank = { list: () => ({
						records,
						skipped: listing.skipped
					}) };
					if (listing.skipped.length > 0) extra.push("题库里有 " + String(listing.skipped.length) + " 个坏文件被跳过。");
				} catch (error) {
					extra.push("题库读不出来（" + (error instanceof Error ? error.message : String(error)) + "），这一轮只给课表那两块。");
				}
				const reader = textbook();
				if (reader === void 0) extra.push("教材语料不可用（数据目录没找到），页数给不出来。");
				const result = plan(state, {
					...bank === void 0 ? {} : { bank },
					...reader === void 0 ? {} : { textbook: reader },
					today,
					minutes
				});
				if (corrupted) result.notes.unshift("schedule.json 读不出来，已经当作空记录；课表和进度需要重新录一次。");
				result.notes.push(...extra);
				return renderPlan(result);
			} catch (error) {
				return explain(error);
			}
		}
	}));
}
//#endregion
export { Config, apply, inject, name };

//# sourceMappingURL=index.js.map