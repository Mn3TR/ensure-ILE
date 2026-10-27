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

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { formatLocalDate, isValidDate } from './dates.ts'

/** Weekdays run 1 (Monday) through 7 (Sunday). */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

/** Days the timetable does not run as written. */
export const EXCEPTION_KINDS = ['holiday', 'swap', 'exam'] as const
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number]

/** Biggest pacing accepted: one lesson rarely covers more than a few sections. */
export const MAX_PACE = 10

/** One subject. `bookId` binds it to a textbook, which is what turns a section
 * title into page numbers. */
export interface Subject {
  id: string
  name: string
  bookId?: string
  note?: string
}

/** One recurring lesson of the week. */
export interface WeeklyLesson {
  weekday: number
  slot: number
  subject: string
  note?: string
}

/** The weekly timetable. */
export interface Timetable {
  weekly: WeeklyLesson[]
}

/** How many sections one lesson moves forward. */
export interface PaceEntry {
  perLesson: number
}

/** Where one subject currently stands. */
export interface ProgressEntry {
  section: string
  /** The day the learner said so; a manual record beats any projection. */
  at: string
}

/** A day that does not run as written. */
export interface ScheduleException {
  date: string
  kind: ExceptionKind
  /** Absent means the whole day; present means only this subject is affected. */
  subject?: string
  note?: string
}

/** The whole schedule record. */
export interface ScheduleState {
  schema: 1
  subjects: Subject[]
  timetable: Timetable
  pace: Record<string, PaceEntry>
  progress: Record<string, ProgressEntry>
  exceptions: ScheduleException[]
  updatedAt?: string
}

/** Failure with a stable code so the tool can answer in one sentence. */
export class ScheduleError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'ScheduleError'
  }
}

/** A fresh, empty record. */
export function emptySchedule(): ScheduleState {
  return { schema: 1, subjects: [], timetable: { weekly: [] }, pace: {}, progress: {}, exceptions: [] }
}

/**
 * Resolve the default schedule file under the Harness home.
 * @returns the absolute path.
 */
export function defaultScheduleFile(): string {
  const home = process.env.DSH_HOME?.trim()
  const base = home !== undefined && home.length > 0 ? home : process.cwd()
  return join(base, 'schedule', 'schedule.json')
}

/** What one read produced: the record plus whether the file had to be discarded. */
export interface LoadedSchedule {
  state: ScheduleState
  corrupted: boolean
}

/**
 * Read the schedule, or an empty one.
 * @param file - absolute path.
 * @returns the record; a corrupt file yields an empty record rather than a throw.
 */
export function loadSchedule(file: string): LoadedSchedule {
  if (!existsSync(file)) return { state: emptySchedule(), corrupted: false }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    // One broken file costs a re-entry; refusing to plan would cost the whole day.
    return { state: emptySchedule(), corrupted: true }
  }
  if (typeof raw !== 'object' || raw === null) return { state: emptySchedule(), corrupted: true }
  const value = raw as Record<string, unknown>
  if (value.schema !== undefined && value.schema !== 1) return { state: emptySchedule(), corrupted: true }
  return { state: normalizeSchedule(value), corrupted: false }
}

/** Read just the record. */
export function readSchedule(file: string): ScheduleState {
  return loadSchedule(file).state
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Rebuild a record from parsed JSON, dropping entries that no longer make sense.
 * Never throws: a partially readable file still gives a partially usable plan.
 */
export function normalizeSchedule(value: Record<string, unknown>): ScheduleState {
  const state = emptySchedule()

  const seen = new Set<string>()
  for (const entry of asArray(value.subjects)) {
    const item = asRecord(entry)
    if (item === undefined) continue
    const id = text(item.id)
    const name = text(item.name)
    if (id.length === 0 || name.length === 0 || seen.has(id)) continue
    seen.add(id)
    const subject: Subject = { id, name }
    const bookId = text(item.bookId)
    if (bookId.length > 0) subject.bookId = bookId
    const note = text(item.note)
    if (note.length > 0) subject.note = note
    state.subjects.push(subject)
  }

  for (const entry of asArray(asRecord(value.timetable)?.weekly)) {
    const item = asRecord(entry)
    if (item === undefined) continue
    const weekday = item.weekday
    const slot = item.slot
    const subject = text(item.subject)
    if (typeof weekday !== 'number' || !(WEEKDAYS as readonly number[]).includes(weekday)) continue
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 1) continue
    if (subject.length === 0) continue
    const lesson: WeeklyLesson = { weekday, slot, subject }
    const note = text(item.note)
    if (note.length > 0) lesson.note = note
    state.timetable.weekly.push(lesson)
  }
  state.timetable.weekly = sortLessons(state.timetable.weekly)

  for (const [key, entry] of Object.entries(asRecord(value.pace) ?? {})) {
    const item = asRecord(entry)
    if (item === undefined) continue
    const perLesson = item.perLesson
    if (typeof perLesson !== 'number' || !Number.isInteger(perLesson) || perLesson < 1) continue
    state.pace[key] = { perLesson }
  }

  for (const [key, entry] of Object.entries(asRecord(value.progress) ?? {})) {
    const item = asRecord(entry)
    if (item === undefined) continue
    const section = text(item.section)
    if (section.length === 0) continue
    const at = text(item.at)
    state.progress[key] = { section, at: isValidDate(at) ? at : '' }
  }

  for (const entry of asArray(value.exceptions)) {
    const item = asRecord(entry)
    if (item === undefined) continue
    const date = text(item.date)
    const kind = text(item.kind)
    if (!isValidDate(date)) continue
    if (!(EXCEPTION_KINDS as readonly string[]).includes(kind)) continue
    const exception: ScheduleException = { date, kind: kind as ExceptionKind }
    const subject = text(item.subject)
    if (subject.length > 0) exception.subject = subject
    const note = text(item.note)
    if (note.length > 0) exception.note = note
    state.exceptions.push(exception)
  }
  state.exceptions = sortExceptions(state.exceptions)

  const updatedAt = text(value.updatedAt)
  if (isValidDate(updatedAt)) state.updatedAt = updatedAt
  return state
}

/** Order lessons by weekday, then slot, then subject id. */
export function sortLessons(lessons: WeeklyLesson[]): WeeklyLesson[] {
  return [...lessons].sort((left, right) =>
    left.weekday - right.weekday || left.slot - right.slot || left.subject.localeCompare(right.subject))
}

/** Order exceptions by date, then kind, then subject. */
export function sortExceptions(exceptions: ScheduleException[]): ScheduleException[] {
  return [...exceptions].sort((left, right) =>
    left.date.localeCompare(right.date)
    || left.kind.localeCompare(right.kind)
    || (left.subject ?? '').localeCompare(right.subject ?? ''))
}

/** One subject to add or update. */
export interface SubjectInput {
  id: string
  name: string
  bookId?: string
  note?: string
}

/** One lesson to write. */
export interface LessonInput {
  weekday: number
  slot: number
  subject: string
  note?: string
}

/** One pacing entry. */
export interface PaceInput {
  subject: string
  perLesson: number
}

/** One progress record; `at` defaults to today. */
export interface ProgressInput {
  subject: string
  section: string
  at?: string
}

/** One exception to add. */
export interface ExceptionInput {
  date: string
  kind: string
  subject?: string
  note?: string
}

/** Which exceptions to drop; every field given has to match. */
export interface ExceptionKey {
  date: string
  kind?: string
  subject?: string
}

/** One field-level write. Fields that are absent are left exactly as they are. */
export interface SchedulePatch {
  subjects?: SubjectInput[]
  removeSubjects?: string[]
  weekly?: LessonInput[]
  addLessons?: LessonInput[]
  pace?: PaceInput[]
  progress?: ProgressInput[]
  addExceptions?: ExceptionInput[]
  removeExceptions?: ExceptionKey[]
}

function needText(value: string, label: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new ScheduleError(label + '不能为空。', 'invalid-input')
  return trimmed
}

function needSubjectId(value: string): string {
  const id = needText(value, '科目 id ')
  if (id.includes('/') || id.includes('\\') || id === '.' || id === '..') {
    throw new ScheduleError('科目 id 不能带路径字符：' + id, 'invalid-input')
  }
  return id
}

function needWeekday(value: number): number {
  if (!Number.isInteger(value) || !(WEEKDAYS as readonly number[]).includes(value)) {
    throw new ScheduleError('weekday 要写 1–7（周一=1，周日=7），收到 ' + String(value) + '。', 'invalid-input')
  }
  return value
}

function needSlot(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new ScheduleError('slot 要是从 1 开始的整数（当天第几节），收到 ' + String(value) + '。', 'invalid-input')
  }
  return value
}

function needPace(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_PACE) {
    throw new ScheduleError('pace 要是 1–' + String(MAX_PACE) + ' 之间的整数（每次课推进几节），收到 ' + String(value) + '。', 'invalid-input')
  }
  return value
}

function needDate(value: string, label: string): string {
  const trimmed = value.trim()
  if (!isValidDate(trimmed)) throw new ScheduleError(label + '要写成 YYYY-MM-DD，收到 ' + trimmed + '。', 'invalid-input')
  return trimmed
}

/**
 * Merge one patch into a record without touching the file.
 * @param state - the record to start from.
 * @param patch - the fields to write.
 * @param today - `YYYY-MM-DD` used for `updatedAt` and for progress without `at`.
 * @returns the merged record.
 */
export function applyPatch(state: ScheduleState, patch: SchedulePatch, today: string): ScheduleState {
  const subjects = state.subjects.map(subject => ({ ...subject }))
  const find = (id: string): Subject | undefined => subjects.find(item => item.id === id)
  const requireSubject = (id: string): Subject => {
    const found = find(id)
    if (found === undefined) {
      throw new ScheduleError('还没录这个科目：' + id + '（先用 subjects 把它加进来）。', 'unknown-subject')
    }
    return found
  }

  for (const input of patch.subjects ?? []) {
    const id = needSubjectId(input.id)
    const name = needText(input.name, '科目名 ')
    const existing = find(id)
    if (existing === undefined) {
      const subject: Subject = { id, name }
      if (input.bookId !== undefined) {
        const bookId = input.bookId.trim()
        if (bookId.length > 0) subject.bookId = bookId
      }
      if (input.note !== undefined) {
        const note = input.note.trim()
        if (note.length > 0) subject.note = note
      }
      subjects.push(subject)
      continue
    }
    existing.name = name
    if (input.bookId !== undefined) {
      // 空字符串等于解绑：换教材或还没定的时候都要能撤回。
      const bookId = input.bookId.trim()
      if (bookId.length > 0) existing.bookId = bookId
      else delete existing.bookId
    }
    if (input.note !== undefined) {
      const note = input.note.trim()
      if (note.length > 0) existing.note = note
      else delete existing.note
    }
  }

  const removed = new Set<string>()
  for (const id of patch.removeSubjects ?? []) {
    const index = subjects.findIndex(item => item.id === id)
    if (index < 0) continue
    removed.add(id)
    subjects.splice(index, 1)
  }

  const toLesson = (input: LessonInput): WeeklyLesson => {
    const weekday = needWeekday(input.weekday)
    const slot = needSlot(input.slot)
    const subject = requireSubject(needSubjectId(input.subject))
    const lesson: WeeklyLesson = { weekday, slot, subject: subject.id }
    if (input.note !== undefined) {
      const note = input.note.trim()
      if (note.length > 0) lesson.note = note
    }
    return lesson
  }

  let weekly = state.timetable.weekly.map(lesson => ({ ...lesson }))
  if (patch.weekly !== undefined) weekly = patch.weekly.map(toLesson)
  if (patch.addLessons !== undefined) {
    // 同一天同一节以新的为准：调课就是换掉那一格。
    for (const lesson of patch.addLessons.map(toLesson)) {
      weekly = weekly.filter(item => item.weekday !== lesson.weekday || item.slot !== lesson.slot)
      weekly.push(lesson)
    }
  }
  if (removed.size > 0) weekly = weekly.filter(lesson => !removed.has(lesson.subject))

  const pace: Record<string, PaceEntry> = { ...state.pace }
  for (const input of patch.pace ?? []) {
    const subject = requireSubject(needSubjectId(input.subject))
    pace[subject.id] = { perLesson: needPace(input.perLesson) }
  }

  const progress: Record<string, ProgressEntry> = { ...state.progress }
  for (const input of patch.progress ?? []) {
    const subject = requireSubject(needSubjectId(input.subject))
    const section = needText(input.section, '进度（章节）')
    const at = input.at === undefined ? today : needDate(input.at, '进度日期 ')
    progress[subject.id] = { section, at }
  }

  let exceptions = state.exceptions.map(item => ({ ...item }))
  for (const key of patch.removeExceptions ?? []) {
    const date = needDate(key.date, '例外日期 ')
    exceptions = exceptions.filter(item => !(item.date === date
      && (key.kind === undefined || item.kind === key.kind)
      && (key.subject === undefined || item.subject === key.subject)))
  }
  for (const input of patch.addExceptions ?? []) {
    const date = needDate(input.date, '例外日期 ')
    const kind = input.kind.trim()
    if (!(EXCEPTION_KINDS as readonly string[]).includes(kind)) {
      throw new ScheduleError('kind 只能是 holiday（放假）/ swap（调课）/ exam（考试日），收到 ' + kind + '。', 'invalid-input')
    }
    const exception: ScheduleException = { date, kind: kind as ExceptionKind }
    if (input.subject !== undefined && input.subject.trim().length > 0) {
      exception.subject = requireSubject(input.subject.trim()).id
    }
    if (input.note !== undefined) {
      const note = input.note.trim()
      if (note.length > 0) exception.note = note
    }
    const duplicate = exceptions.some(item => item.date === exception.date
      && item.kind === exception.kind && item.subject === exception.subject)
    if (!duplicate) exceptions.push(exception)
  }

  for (const id of removed) {
    delete pace[id]
    delete progress[id]
  }

  return {
    schema: 1,
    subjects,
    timetable: { weekly: sortLessons(weekly) },
    pace,
    progress,
    exceptions: sortExceptions(exceptions),
    updatedAt: today,
  }
}

/**
 * Apply one patch and persist it atomically.
 * @param file - absolute path.
 * @param patch - the fields to write.
 * @param now - clock injection for tests.
 * @returns the merged record.
 */
export function updateSchedule(file: string, patch: SchedulePatch, now: Date = new Date()): ScheduleState {
  const current = readSchedule(file)
  const next = applyPatch(current, patch, formatLocalDate(now))
  mkdirSync(dirname(file), { recursive: true })
  const temporary = file + '.tmp'
  writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n')
  renameSync(temporary, file)
  return next
}
