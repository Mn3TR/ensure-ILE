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
export declare const WEEKDAYS: readonly [1, 2, 3, 4, 5, 6, 7];
/** Days the timetable does not run as written. */
export declare const EXCEPTION_KINDS: readonly ["holiday", "swap", "exam"];
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];
/** Biggest pacing accepted: one lesson rarely covers more than a few sections. */
export declare const MAX_PACE = 10;
/** One subject. `bookId` binds it to a textbook, which is what turns a section
 * title into page numbers. */
export interface Subject {
    id: string;
    name: string;
    bookId?: string;
    note?: string;
}
/** One recurring lesson of the week. */
export interface WeeklyLesson {
    weekday: number;
    slot: number;
    subject: string;
    note?: string;
}
/** The weekly timetable. */
export interface Timetable {
    weekly: WeeklyLesson[];
}
/** How many sections one lesson moves forward. */
export interface PaceEntry {
    perLesson: number;
}
/** Where one subject currently stands. */
export interface ProgressEntry {
    section: string;
    /** The day the learner said so; a manual record beats any projection. */
    at: string;
}
/** A day that does not run as written. */
export interface ScheduleException {
    date: string;
    kind: ExceptionKind;
    /** Absent means the whole day; present means only this subject is affected. */
    subject?: string;
    note?: string;
}
/** The whole schedule record. */
export interface ScheduleState {
    schema: 1;
    subjects: Subject[];
    timetable: Timetable;
    pace: Record<string, PaceEntry>;
    progress: Record<string, ProgressEntry>;
    exceptions: ScheduleException[];
    updatedAt?: string;
}
/** Failure with a stable code so the tool can answer in one sentence. */
export declare class ScheduleError extends Error {
    readonly code: string;
    constructor(message: string, code: string);
}
/** A fresh, empty record. */
export declare function emptySchedule(): ScheduleState;
/**
 * Resolve the default schedule file under the Harness home.
 * @returns the absolute path.
 */
export declare function defaultScheduleFile(): string;
/** What one read produced: the record plus whether the file had to be discarded. */
export interface LoadedSchedule {
    state: ScheduleState;
    corrupted: boolean;
}
/**
 * Read the schedule, or an empty one.
 * @param file - absolute path.
 * @returns the record; a corrupt file yields an empty record rather than a throw.
 */
export declare function loadSchedule(file: string): LoadedSchedule;
/** Read just the record. */
export declare function readSchedule(file: string): ScheduleState;
/**
 * Rebuild a record from parsed JSON, dropping entries that no longer make sense.
 * Never throws: a partially readable file still gives a partially usable plan.
 */
export declare function normalizeSchedule(value: Record<string, unknown>): ScheduleState;
/** Order lessons by weekday, then slot, then subject id. */
export declare function sortLessons(lessons: WeeklyLesson[]): WeeklyLesson[];
/** Order exceptions by date, then kind, then subject. */
export declare function sortExceptions(exceptions: ScheduleException[]): ScheduleException[];
/** One subject to add or update. */
export interface SubjectInput {
    id: string;
    name: string;
    bookId?: string;
    note?: string;
}
/** One lesson to write. */
export interface LessonInput {
    weekday: number;
    slot: number;
    subject: string;
    note?: string;
}
/** One pacing entry. */
export interface PaceInput {
    subject: string;
    perLesson: number;
}
/** One progress record; `at` defaults to today. */
export interface ProgressInput {
    subject: string;
    section: string;
    at?: string;
}
/** One exception to add. */
export interface ExceptionInput {
    date: string;
    kind: string;
    subject?: string;
    note?: string;
}
/** Which exceptions to drop; every field given has to match. */
export interface ExceptionKey {
    date: string;
    kind?: string;
    subject?: string;
}
/** One field-level write. Fields that are absent are left exactly as they are. */
export interface SchedulePatch {
    subjects?: SubjectInput[];
    removeSubjects?: string[];
    weekly?: LessonInput[];
    addLessons?: LessonInput[];
    pace?: PaceInput[];
    progress?: ProgressInput[];
    addExceptions?: ExceptionInput[];
    removeExceptions?: ExceptionKey[];
}
/**
 * Merge one patch into a record without touching the file.
 * @param state - the record to start from.
 * @param patch - the fields to write.
 * @param today - `YYYY-MM-DD` used for `updatedAt` and for progress without `at`.
 * @returns the merged record.
 */
export declare function applyPatch(state: ScheduleState, patch: SchedulePatch, today: string): ScheduleState;
/**
 * Apply one patch and persist it atomically.
 * @param file - absolute path.
 * @param patch - the fields to write.
 * @param now - clock injection for tests.
 * @returns the merged record.
 */
export declare function updateSchedule(file: string, patch: SchedulePatch, now?: Date): ScheduleState;
