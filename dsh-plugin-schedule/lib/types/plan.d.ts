/**
 * Turning a schedule into today's work: what the next lesson covers, what to
 * read before it, which problems are due, and what has been rotting.
 *
 * This module is pure on purpose. It never imports the problem bank or the
 * textbook package and never touches Cordis: everything outside the schedule
 * arrives through PlanDeps, so the tool row can wire the real readers in and
 * the tests can feed plain objects. That seam is the only place the package
 * knows about its siblings.
 * @module dsh-plugin-schedule/plan
 */
import type { ScheduleState, WeeklyLesson } from './store.ts';
/** One problem costs about this many minutes; the budget divides by it. */
export declare const MINUTES_PER_PROBLEM = 8;
/** A problem nobody has touched for this long shows up as leftover. */
export declare const STALE_DAYS = 14;
/** Getting the same problem wrong this many times marks it as leftover. */
export declare const WRONG_THRESHOLD = 2;
/** How far ahead to look for the next lesson before giving up. */
export declare const PLAN_WINDOW_DAYS = 14;
/** The slice of a bank problem this module needs; see dsh-plugin-bankmanager/store. */
export interface BankProblem {
    id: string;
    subject: string;
    status: string;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    review?: {
        nextAt?: string | undefined;
    } | undefined;
    work?: {
        attempts?: readonly BankAttempt[] | undefined;
    } | undefined;
}
/** One recorded attempt; only the verdict matters here. */
export interface BankAttempt {
    at?: string | undefined;
    verdict?: string | undefined;
}
/** Read-only view of the problem bank. */
export interface BankReader {
    list(): {
        records: BankProblem[];
        skipped: {
            file: string;
            reason: string;
        }[];
    };
}
/** One section of a textbook, in PDF page numbers. */
export interface TextbookSection {
    level: number;
    title: string;
    pdfPage: number;
    endPage: number;
}
/** The book itself; textbookOffset converts PDF pages into printed pages. */
export interface TextbookBook {
    id: string;
    title: string;
    textbookOffset: number;
}
/** Read-only view of the textbook corpus. */
export interface BookReader {
    book(bookId: string): TextbookBook | undefined;
    /** First section of the book, used when nothing has been recorded yet. */
    startSection(bookId: string): TextbookSection | undefined;
    /** The section right after afterTitle; undefined at the end or on a bad title. */
    nextSection(bookId: string, afterTitle: string): TextbookSection | undefined;
}
/** Everything plan() needs from the outside world. */
export interface PlanDeps {
    /** Absent when the bank package is not reachable; the schedule half still works. */
    bank?: BankReader | undefined;
    /** Absent when the textbook corpus is not reachable; sections stay titles only. */
    textbook?: BookReader | undefined;
    /** Local YYYY-MM-DD for "today". */
    today: string;
    /** Study minutes for today; divide by MINUTES_PER_PROBLEM. */
    minutes: number;
}
/** Why a problem is on today's review list. */
export type ReviewReason = 'due' | 'wrong' | 'stuck';
/** One problem to review today. */
export interface ReviewItem {
    id: string;
    subject: string;
    reason: ReviewReason;
    why: string;
}
/** Why a problem is left behind. */
export type LeftoverReason = 'stale' | 'wrong-twice';
/** One problem that has not moved. */
export interface LeftoverItem {
    id: string;
    subject: string;
    reason: LeftoverReason;
    why: string;
}
/** The next lesson, with the sections it is supposed to cover. */
export interface UpcomingLesson {
    date: string;
    /** 今天 / 明天 / 周四. */
    dayLabel: string;
    weekday: number;
    slot: number;
    subjectId: string;
    subjectName: string;
    /** Section recorded as done; undefined means nothing recorded yet. */
    from: string | undefined;
    /** Last section this lesson should reach. */
    to: string | undefined;
    /** Section titles this lesson covers, in order. */
    sections: string[];
    note: string | undefined;
    /** Set when the page numbers could not be produced. */
    gap: string | undefined;
}
/** Where to read before the next lesson. */
export interface PrepAnchor {
    subjectId: string;
    subjectName: string;
    bookTitle: string;
    section: string;
    pdfPages: string;
    bookPages: string | undefined;
    hint: string;
}
/** Everything one plan turn says. */
export interface PlanResult {
    date: string;
    budget: number;
    upcoming: UpcomingLesson[];
    prep: PrepAnchor[];
    review: ReviewItem[];
    /** Problems that were due but did not fit into the minutes budget. */
    reviewOverflow: number;
    leftover: LeftoverItem[];
    /** Things the learner has not recorded, or data that was skipped. */
    notes: string[];
}
/**
 * The next day that actually runs, and the lessons still standing on it.
 * Holidays and exam days drop out; a subject-scoped exception only drops that subject.
 * @param state - the record.
 * @param today - local YYYY-MM-DD.
 * @returns the first usable day within PLAN_WINDOW_DAYS, or undefined.
 */
export declare function nextLessonDay(state: ScheduleState, today: string): {
    date: string;
    lessons: WeeklyLesson[];
} | undefined;
/**
 * Build today's plan.
 * @param state - the schedule record.
 * @param deps - bank, textbook, today and the minutes budget.
 * @returns the four blocks plus the notes that explain what is missing.
 */
export declare function plan(state: ScheduleState, deps: PlanDeps): PlanResult;
/**
 * Render a plan as the text the model reads.
 * @param result - the computed plan.
 * @returns Chinese text with the four blocks in a fixed order.
 */
export declare function renderPlan(result: PlanResult): string;
