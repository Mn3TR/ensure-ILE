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

import { addDays, datePart, daysBetween, weekdayName, weekdayOf } from './dates.ts'
import type { ScheduleState, WeeklyLesson } from './store.ts'

/** One problem costs about this many minutes; the budget divides by it. */
export const MINUTES_PER_PROBLEM = 8

/** A problem nobody has touched for this long shows up as leftover. */
export const STALE_DAYS = 14

/** Getting the same problem wrong this many times marks it as leftover. */
export const WRONG_THRESHOLD = 2

/** How far ahead to look for the next lesson before giving up. */
export const PLAN_WINDOW_DAYS = 14

/** The slice of a bank problem this module needs; see dsh-plugin-bankmanager/store. */
export interface BankProblem {
  id: string
  subject: string
  status: string
  createdAt?: string | undefined
  updatedAt?: string | undefined
  review?: { nextAt?: string | undefined } | undefined
  work?: { attempts?: readonly BankAttempt[] | undefined } | undefined
}

/** One recorded attempt; only the verdict matters here. */
export interface BankAttempt {
  at?: string | undefined
  verdict?: string | undefined
}

/** Read-only view of the problem bank. */
export interface BankReader {
  list(): { records: BankProblem[]; skipped: { file: string; reason: string }[] }
}

/** One section of a textbook, in PDF page numbers. */
export interface TextbookSection {
  level: number
  title: string
  pdfPage: number
  endPage: number
}

/** The book itself; textbookOffset converts PDF pages into printed pages. */
export interface TextbookBook {
  id: string
  title: string
  textbookOffset: number
}

/** Read-only view of the textbook corpus. */
export interface BookReader {
  book(bookId: string): TextbookBook | undefined
  /** First section of the book, used when nothing has been recorded yet. */
  startSection(bookId: string): TextbookSection | undefined
  /** The section right after afterTitle; undefined at the end or on a bad title. */
  nextSection(bookId: string, afterTitle: string): TextbookSection | undefined
}

/** Everything plan() needs from the outside world. */
export interface PlanDeps {
  /** Absent when the bank package is not reachable; the schedule half still works. */
  bank?: BankReader | undefined
  /** Absent when the textbook corpus is not reachable; sections stay titles only. */
  textbook?: BookReader | undefined
  /** Local YYYY-MM-DD for "today". */
  today: string
  /** Study minutes for today; divide by MINUTES_PER_PROBLEM. */
  minutes: number
}

/** Why a problem is on today's review list. */
export type ReviewReason = 'due' | 'wrong' | 'stuck'

/** One problem to review today. */
export interface ReviewItem {
  id: string
  subject: string
  reason: ReviewReason
  why: string
}

/** Why a problem is left behind. */
export type LeftoverReason = 'stale' | 'wrong-twice'

/** One problem that has not moved. */
export interface LeftoverItem {
  id: string
  subject: string
  reason: LeftoverReason
  why: string
}

/** The next lesson, with the sections it is supposed to cover. */
export interface UpcomingLesson {
  date: string
  /** 今天 / 明天 / 周四. */
  dayLabel: string
  weekday: number
  slot: number
  subjectId: string
  subjectName: string
  /** Section recorded as done; undefined means nothing recorded yet. */
  from: string | undefined
  /** Last section this lesson should reach. */
  to: string | undefined
  /** Section titles this lesson covers, in order. */
  sections: string[]
  note: string | undefined
  /** Set when the page numbers could not be produced. */
  gap: string | undefined
}

/** Where to read before the next lesson. */
export interface PrepAnchor {
  subjectId: string
  subjectName: string
  bookTitle: string
  section: string
  pdfPages: string
  bookPages: string | undefined
  hint: string
}

/** Everything one plan turn says. */
export interface PlanResult {
  date: string
  budget: number
  upcoming: UpcomingLesson[]
  prep: PrepAnchor[]
  review: ReviewItem[]
  /** Problems that were due but did not fit into the minutes budget. */
  reviewOverflow: number
  leftover: LeftoverItem[]
  /** Things the learner has not recorded, or data that was skipped. */
  notes: string[]
}

const HINT_PREVIEW = '先翻到这一段，自己提两个问题：它在定义什么，它和上一节哪个结论接着。别急着看例题答案。'

const HINT_NO_TEXTBOOK = '教材没绑定或者读不到页数，先按章节标题翻书。'

function subjectNameOf(state: ScheduleState, id: string): string {
  return state.subjects.find(subject => subject.id === id)?.name ?? id
}

function subjectOrder(state: ScheduleState, id: string): number {
  const index = state.subjects.findIndex(subject => subject.id === id)
  return index < 0 ? state.subjects.length : index
}

function isDayOff(state: ScheduleState, date: string, subjectId: string | undefined): boolean {
  return state.exceptions.some(exception =>
    exception.date === date
    && (exception.kind === 'holiday' || exception.kind === 'exam')
    && (exception.subject === undefined || exception.subject === subjectId))
}

/**
 * The next day that actually runs, and the lessons still standing on it.
 * Holidays and exam days drop out; a subject-scoped exception only drops that subject.
 * @param state - the record.
 * @param today - local YYYY-MM-DD.
 * @returns the first usable day within PLAN_WINDOW_DAYS, or undefined.
 */
export function nextLessonDay(
  state: ScheduleState,
  today: string,
): { date: string; lessons: WeeklyLesson[] } | undefined {
  for (let offset = 0; offset <= PLAN_WINDOW_DAYS; offset += 1) {
    const date = addDays(today, offset)
    const weekday = weekdayOf(date)
    const lessons = state.timetable.weekly.filter(lesson => lesson.weekday === weekday)
    if (lessons.length === 0) continue
    const open = lessons.filter(lesson => !isDayOff(state, date, lesson.subject))
    if (open.length === 0) continue
    return { date, lessons: open }
  }
  return undefined
}

function dayLabel(date: string, today: string): string {
  const gap = daysBetween(today, date)
  if (gap === 0) return '今天'
  if (gap === 1) return '明天'
  return weekdayName(weekdayOf(date))
}

function pagesLabel(from: number, to: number): string {
  return from === to ? String(from) : String(from) + '–' + String(to)
}

/** Sections one lesson covers, starting after whatever was recorded. */
function advanceSections(
  state: ScheduleState,
  subjectId: string,
  reader: BookReader | undefined,
): { sections: TextbookSection[]; gap: string | undefined } {
  const subject = state.subjects.find(item => item.id === subjectId)
  const bookId = subject?.bookId
  if (reader === undefined) return { sections: [], gap: '教材库不可用，只能按章节标题走。' }
  if (bookId === undefined || bookId.length === 0) {
    return { sections: [], gap: '这个科目还没绑定教材（subjects 的 bookId），给不出页数。' }
  }
  const pace = state.pace[subjectId]?.perLesson ?? 1
  const recorded = state.progress[subjectId]?.section
  const sections: TextbookSection[] = []
  let cursor = recorded
  for (let step = 0; step < pace; step += 1) {
    const next = cursor === undefined || cursor.length === 0
      ? reader.startSection(bookId)
      : reader.nextSection(bookId, cursor)
    if (next === undefined) {
      return {
        sections,
        gap: cursor === undefined || cursor.length === 0
          ? '这本书里找不到第一节（bookId: ' + bookId + '）。'
          : '进度里的「' + cursor + '」在教材里没找到，或者已经是最后一节。',
      }
    }
    sections.push(next)
    cursor = next.title
  }
  return { sections, gap: undefined }
}

function wrongCount(problem: BankProblem): number {
  return (problem.work?.attempts ?? []).filter(attempt => attempt.verdict === 'wrong').length
}

function alive(problem: BankProblem): boolean {
  return problem.status !== 'mastered' && problem.status !== 'parked'
}

function dueDate(problem: BankProblem): string | undefined {
  const nextAt = problem.review?.nextAt
  return nextAt === undefined ? undefined : datePart(nextAt)
}

function lastTouched(problem: BankProblem): string | undefined {
  return datePart(problem.updatedAt) ?? datePart(problem.createdAt)
}

/**
 * Build today's plan.
 * @param state - the schedule record.
 * @param deps - bank, textbook, today and the minutes budget.
 * @returns the four blocks plus the notes that explain what is missing.
 */
export function plan(state: ScheduleState, deps: PlanDeps): PlanResult {
  const notes: string[] = []
  const budget = Math.max(1, Math.floor(deps.minutes / MINUTES_PER_PROBLEM))

  if (state.timetable.weekly.length === 0) {
    notes.push('还没录课表（schedule_update 的 weekly）——先录课表和进度；复习这块现在就能用，下面照常列。')
  }
  if (state.subjects.length === 0) notes.push('还没有科目（schedule_update 的 subjects）。')

  const day = nextLessonDay(state, deps.today)
  const upcoming: UpcomingLesson[] = []
  const prep: PrepAnchor[] = []

  for (const lesson of day?.lessons ?? []) {
    const { sections, gap } = advanceSections(state, lesson.subject, deps.textbook)
    const recorded = state.progress[lesson.subject]?.section
    const bookId = state.subjects.find(item => item.id === lesson.subject)?.bookId ?? ''
    const book = deps.textbook?.book(bookId)
    const lessonDate = day === undefined ? deps.today : day.date
    upcoming.push({
      date: lessonDate,
      dayLabel: dayLabel(lessonDate, deps.today),
      weekday: lesson.weekday,
      slot: lesson.slot,
      subjectId: lesson.subject,
      subjectName: subjectNameOf(state, lesson.subject),
      from: recorded,
      to: sections.at(-1)?.title,
      sections: sections.map(section => section.title),
      note: lesson.note,
      gap,
    })
    const first = sections.at(0)
    if (first === undefined) continue
    if (book === undefined) {
      prep.push({
        subjectId: lesson.subject,
        subjectName: subjectNameOf(state, lesson.subject),
        bookTitle: '（教材未绑定）',
        section: first.title,
        pdfPages: pagesLabel(first.pdfPage, first.endPage),
        bookPages: undefined,
        hint: HINT_NO_TEXTBOOK,
      })
      continue
    }
    const start = first.pdfPage - book.textbookOffset
    const end = first.endPage - book.textbookOffset
    prep.push({
      subjectId: lesson.subject,
      subjectName: subjectNameOf(state, lesson.subject),
      bookTitle: book.title,
      section: first.title,
      pdfPages: pagesLabel(first.pdfPage, first.endPage),
      bookPages: pagesLabel(start, end),
      hint: HINT_PREVIEW,
    })
  }

  if (day === undefined && state.timetable.weekly.length > 0) {
    notes.push('往后 ' + String(PLAN_WINDOW_DAYS) + ' 天里没有能上的课（假期或者空档），先按复习走。')
  }
  const recordedCount = state.subjects.filter(subject => state.progress[subject.id] !== undefined).length
  if (state.subjects.length > 0 && recordedCount === 0) {
    notes.push('还没录进度（schedule_update 的 progress）——不知道讲到哪一节，只能给到这个课的排期。')
  }

  const records = deps.bank === undefined ? [] : deps.bank.list().records
  const live = records.filter(alive)
  const listed = new Set<string>()

  const due = live
    .map(problem => ({ problem, due: dueDate(problem) }))
    .filter((item): item is { problem: BankProblem; due: string } =>
      item.due !== undefined && item.due <= deps.today)
    .sort((left, right) =>
      left.due.localeCompare(right.due)
      || subjectOrder(state, left.problem.subject) - subjectOrder(state, right.problem.subject)
      || left.problem.id.localeCompare(right.problem.id))

  const queue: ReviewItem[] = due.map(item => ({
    id: item.problem.id,
    subject: item.problem.subject,
    reason: 'due',
    why: '到期（' + item.due + '）',
  }))
  for (const item of queue) listed.add(item.id)

  const wrong = live
    .filter(problem => !listed.has(problem.id) && wrongCount(problem) > 0)
    .sort((left, right) =>
      subjectOrder(state, left.subject) - subjectOrder(state, right.subject)
      || left.id.localeCompare(right.id))
  for (const problem of wrong) {
    queue.push({
      id: problem.id,
      subject: problem.subject,
      reason: 'wrong',
      why: '上次做错了（错了 ' + String(wrongCount(problem)) + ' 次）',
    })
    listed.add(problem.id)
  }

  const stuck = live
    .filter(problem => !listed.has(problem.id) && (problem.status === 'guide' || problem.status === 'hrl'))
    .sort((left, right) =>
      subjectOrder(state, left.subject) - subjectOrder(state, right.subject)
      || left.id.localeCompare(right.id))
  for (const problem of stuck) {
    queue.push({
      id: problem.id,
      subject: problem.subject,
      reason: 'stuck',
      why: '停在 ' + problem.status + ' 没走完',
    })
    listed.add(problem.id)
  }

  const review = queue.slice(0, budget)
  const reviewOverflow = queue.length - review.length
  if (records.length === 0 && deps.bank !== undefined) notes.push('题库还是空的，没有可复习的题。')

  const leftover: LeftoverItem[] = []
  for (const problem of live) {
    const wrongs = wrongCount(problem)
    const touched = lastTouched(problem)
    const idle = touched === undefined ? undefined : daysBetween(touched, deps.today)
    if (wrongs >= WRONG_THRESHOLD) {
      leftover.push({
        id: problem.id,
        subject: problem.subject,
        reason: 'wrong-twice',
        why: '同一道错了 ' + String(wrongs) + ' 次',
      })
      continue
    }
    if (idle !== undefined && idle > STALE_DAYS) {
      leftover.push({
        id: problem.id,
        subject: problem.subject,
        reason: 'stale',
        why: '已经 ' + String(idle) + ' 天没动',
      })
    }
  }
  leftover.sort((left, right) =>
    subjectOrder(state, left.subject) - subjectOrder(state, right.subject)
    || left.id.localeCompare(right.id))

  return {
    date: deps.today,
    budget,
    upcoming,
    prep,
    review,
    reviewOverflow,
    leftover,
    notes,
  }
}

/**
 * Render a plan as the text the model reads.
 * @param result - the computed plan.
 * @returns Chinese text with the four blocks in a fixed order.
 */
export function renderPlan(result: PlanResult): string {
  const lines: string[] = []
  const weekday = weekdayName(weekdayOf(result.date))
  lines.push('【' + result.date + ' ' + weekday + '】今天约 ' + String(result.budget * MINUTES_PER_PROBLEM) + ' 分钟的题量预算')

  lines.push('', '一、下一次课讲什么')
  if (result.upcoming.length === 0) {
    lines.push('  课表为空或者后面没有课，先跳到第三块。')
  }
  for (const lesson of result.upcoming) {
    lines.push('  ' + lesson.date + ' ' + lesson.dayLabel + ' 第 ' + String(lesson.slot) + ' 节 · '
      + lesson.subjectName + (lesson.note === undefined ? '' : '（' + lesson.note + '）'))
    lines.push('    上次到：' + (lesson.from === undefined ? '没录' : lesson.from)
      + ' → 这一课讲到：' + (lesson.to === undefined ? '未知' : lesson.to))
    if (lesson.gap !== undefined) lines.push('    注意：' + lesson.gap)
  }

  lines.push('', '二、今天预习（问题你自己提，这里只给锚点）')
  if (result.prep.length === 0) lines.push('  没有可预习的段落（缺课表、缺进度或者教材没绑定）。')
  for (const anchor of result.prep) {
    lines.push('  ' + anchor.subjectName + ' · 《' + anchor.bookTitle + '》 ' + anchor.section)
    lines.push('    PDF 第 ' + anchor.pdfPages + ' 页'
      + (anchor.bookPages === undefined ? '' : '（课本第 ' + anchor.bookPages + ' 页）'))
    lines.push('    ' + anchor.hint)
  }

  lines.push('', '三、今天复习（按到期 → 上次做错 → 卡住的顺序排）')
  if (result.review.length === 0) lines.push('  今天没有到期的题。')
  for (const item of result.review) {
    lines.push('  ' + item.id + ' · ' + item.subject + ' · ' + item.why)
  }
  if (result.reviewOverflow > 0) {
    lines.push('  还有 ' + String(result.reviewOverflow) + ' 道排不进今天，先不动。')
  }

  lines.push('', '四、历史遗留（超过 ' + String(STALE_DAYS) + ' 天没动，或者错了 ' + String(WRONG_THRESHOLD) + ' 次以上）')
  if (result.leftover.length === 0) lines.push('  没有。')
  for (const item of result.leftover) {
    lines.push('  ' + item.id + ' · ' + item.subject + ' · ' + item.why)
  }

  if (result.notes.length > 0) {
    lines.push('', '备注')
    for (const note of result.notes) lines.push('  ' + note)
  }
  return lines.join('\n')
}
