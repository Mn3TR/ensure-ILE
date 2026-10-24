/**
 * Problem-bank storage: one JSON file per problem under `<DSH_HOME>/bank/problems`.
 *
 * A record holds everything that ever happened to one problem — the statement,
 * the guide sessions, attempts, the review schedule and an append-only history.
 * Files are written atomically and read defensively: one broken file is skipped
 * and reported, never a reason to fail a listing.
 * @module dsh-plugin-bankmanager/store
 */

import { randomBytes } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomic, withFileLock } from '@deepseek-ai/dsh-atomic-write'

/** Statuses a problem can carry. */
export const PROBLEM_STATUSES = ['new', 'guide', 'hrl', 'review', 'mastered', 'parked'] as const
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number]

/** How one guide session ended. */
export const GUIDE_OUTCOMES = ['solved', 'stuck', 'abandoned'] as const
export type GuideOutcome = (typeof GUIDE_OUTCOMES)[number]

/** One guided session over a problem. */
export interface GuideSession {
  sessionId?: string
  startedAt: string
  endedAt?: string
  outcome?: GuideOutcome
  whereStuck?: string
}

/** One attempt at solving the problem. */
export interface ProblemAttempt {
  at: string
  mode: string
  answer: string
  verdict: string
}

/** Review schedule state; the scheduler that fills it comes later. */
export interface ReviewState {
  nextAt?: string
  interval?: number
  count: number
  history: string[]
}

/** One history entry. */
export interface HistoryEntry {
  at: string
  event: string
  detail?: string
}

/** A whole problem record. */
export interface ProblemRecord {
  schema: 1
  id: string
  subject: string
  tags: string[]
  statement: string
  attachments: unknown[]
  status: ProblemStatus
  createdAt: string
  updatedAt: string
  guide: { sessions: GuideSession[]; insight?: string }
  attempts: ProblemAttempt[]
  review: ReviewState
  history: HistoryEntry[]
}

/** Failure with a stable code so tools can explain themselves. */
export class BankError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'BankError'
  }
}

/** True when the value names a known status. */
export function isProblemStatus(value: string): value is ProblemStatus {
  return (PROBLEM_STATUSES as readonly string[]).includes(value)
}

/** True when the value names a known guide outcome. */
export function isGuideOutcome(value: string): value is GuideOutcome {
  return (GUIDE_OUTCOMES as readonly string[]).includes(value)
}

/**
 * Turn a free-form subject into the file-name segment of an id.
 * Lowercase ASCII letters and digits survive; every other run collapses to one
 * dash. An empty result becomes `other`.
 * @param subject - the model-chosen subject, in any language.
 */
export function slugSubject(subject: string): string {
  const slug = subject
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  return slug.length > 0 ? slug : 'other'
}

/** Format one local date as `YYYYMMDD`. */
export function formatDate(date: Date): string {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return year + month + day
}

/**
 * Build a fresh problem id.
 * @param subject - free-form subject used for the readable middle segment.
 * @param now - clock injection for tests.
 * @param suffix - six hex characters; random by default.
 */
export function makeProblemId(subject: string, now: Date = new Date(), suffix?: string): string {
  return formatDate(now) + '-' + slugSubject(subject) + '-' + (suffix ?? randomBytes(3).toString('hex'))
}

/** Default bank directory under the Harness home shared with the desktop app. */
export function defaultBankDirectory(home: string | undefined = process.env.DSH_HOME): string {
  const resolved = home !== undefined && home.trim().length > 0
    ? home
    : join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh')
  return join(resolved, 'bank', 'problems')
}

/** Path of one problem file. */
export function problemPath(directory: string, id: string): string {
  if (!/^[a-z0-9-]+$/u.test(id)) throw new BankError('题目 id 不合法：' + id, 'invalid-id')
  return join(directory, id + '.json')
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new BankError('字段 ' + field + ' 必须是字符串', 'invalid-record')
  return value
}

function asArray<T>(value: unknown, field: string): T[] {
  if (!Array.isArray(value)) throw new BankError('字段 ' + field + ' 必须是数组', 'invalid-record')
  return value as T[]
}

/**
 * Validate one parsed file. Corrupt files are the caller's to skip; this throws
 * so the message names the exact field that broke.
 * @param raw - parsed JSON of one problem file.
 */
export function parseRecord(raw: unknown): ProblemRecord {
  if (typeof raw !== 'object' || raw === null) throw new BankError('题目文件不是对象', 'invalid-record')
  const value = raw as Record<string, unknown>
  if (value.schema !== 1) throw new BankError('schema 必须是 1', 'invalid-record')
  const status = asString(value.status, 'status')
  if (!isProblemStatus(status)) throw new BankError('未知状态 ' + status, 'invalid-record')
  const guide = value.guide
  if (typeof guide !== 'object' || guide === null) throw new BankError('guide 必须是对象', 'invalid-record')
  const review = value.review
  if (typeof review !== 'object' || review === null) throw new BankError('review 必须是对象', 'invalid-record')
  return {
    schema: 1,
    id: asString(value.id, 'id'),
    subject: asString(value.subject, 'subject'),
    tags: asArray<string>(value.tags ?? [], 'tags'),
    statement: asString(value.statement, 'statement'),
    attachments: asArray<unknown>(value.attachments ?? [], 'attachments'),
    status,
    createdAt: asString(value.createdAt, 'createdAt'),
    updatedAt: asString(value.updatedAt, 'updatedAt'),
    guide: guide as ProblemRecord['guide'],
    attempts: asArray<ProblemAttempt>(value.attempts ?? [], 'attempts'),
    review: review as ProblemRecord['review'],
    history: asArray<HistoryEntry>(value.history ?? [], 'history'),
  }
}

/** Read one problem, or throw a model-facing error. */
export function readProblem(directory: string, id: string): ProblemRecord {
  const file = problemPath(directory, id)
  if (!existsSync(file)) throw new BankError('没有这道题：' + id, 'not-found')
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    throw new BankError('题目文件损坏：' + id, 'corrupt')
  }
  return parseRecord(raw)
}

/** Result of a defensive listing. */
export interface ProblemListing {
  records: ProblemRecord[]
  skipped: { file: string; reason: string }[]
}

/**
 * List every readable problem. A corrupt file is skipped and named; it never
 * fails the listing.
 * @param directory - bank directory.
 */
export function listProblems(directory: string): ProblemListing {
  if (!existsSync(directory)) return { records: [], skipped: [] }
  const records: ProblemRecord[] = []
  const skipped: { file: string; reason: string }[] = []
  for (const file of readdirSync(directory)) {
    if (!file.endsWith('.json')) continue
    try {
      records.push(parseRecord(JSON.parse(readFileSync(join(directory, file), 'utf8'))))
    } catch (error) {
      skipped.push({ file, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  records.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
  return { records, skipped }
}

/** Input accepted when a problem enters the bank. */
export interface CreateProblemInput {
  statement: string
  subject: string
  tags?: string[]
  now?: Date
  suffix?: string
}

/** Create and persist one problem. */
export async function createProblem(directory: string, input: CreateProblemInput): Promise<ProblemRecord> {
  const statement = input.statement.trim()
  if (statement.length === 0) throw new BankError('statement 不能为空', 'invalid-input')
  const subject = input.subject.trim().length > 0 ? input.subject.trim() : 'other'
  const now = input.now ?? new Date()
  const at = now.toISOString()
  mkdirSync(directory, { recursive: true })
  let id = ''
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = makeProblemId(subject, now, attempt === 0 ? input.suffix : undefined)
    if (!existsSync(problemPath(directory, candidate))) {
      id = candidate
      break
    }
  }
  if (id.length === 0) throw new BankError('生成题目 id 失败，请重试', 'id-collision')
  const record: ProblemRecord = {
    schema: 1,
    id,
    subject,
    tags: input.tags ?? [],
    statement,
    attachments: [],
    status: 'new',
    createdAt: at,
    updatedAt: at,
    guide: { sessions: [] },
    attempts: [],
    review: { count: 0, history: [] },
    history: [{ at, event: 'created' }],
  }
  await writeFileAtomic(problemPath(directory, id), JSON.stringify(record, null, 2) + '\n', { mode: 0o600, dirMode: 0o700 })
  return record
}

/** Fields a caller may change explicitly; everything else goes through `patch`. */
export interface UpdateProblemInput {
  status?: string
  guideOutcome?: string
  whereStuck?: string
  insight?: string
  reviewNextAt?: string
  reviewInterval?: number
  attempt?: { mode: string; answer: string; verdict: string }
  patch?: Record<string, unknown>
  now?: Date
}

/**
 * Apply one update under a cross-process file lock. Unknown fields merge
 * shallowly; arrays replace.
 * @param directory - bank directory.
 * @param id - problem id.
 * @param input - explicit fields plus the free patch.
 */
export async function updateProblem(directory: string, id: string, input: UpdateProblemInput): Promise<ProblemRecord> {
  const file = problemPath(directory, id)
  return withFileLock(file, async () => {
    const record = readProblem(directory, id)
    const now = input.now ?? new Date()
    const at = now.toISOString()
    const events: string[] = []

    if (input.status !== undefined) {
      if (!isProblemStatus(input.status)) throw new BankError('未知状态 ' + input.status, 'invalid-input')
      if (record.status !== input.status) {
        events.push('status ' + record.status + ' -> ' + input.status)
        record.status = input.status
      }
    }
    if (input.guideOutcome !== undefined) {
      if (!isGuideOutcome(input.guideOutcome)) throw new BankError('未知结局 ' + input.guideOutcome, 'invalid-input')
      const open = record.guide.sessions.find(session => session.endedAt === undefined)
      const session: GuideSession = open ?? { startedAt: at }
      session.endedAt = at
      session.outcome = input.guideOutcome
      if (input.whereStuck !== undefined) session.whereStuck = input.whereStuck
      if (open === undefined) record.guide.sessions.push(session)
      events.push('guide ' + input.guideOutcome)
    }
    if (input.insight !== undefined) record.guide.insight = input.insight
    if (input.reviewNextAt !== undefined) record.review.nextAt = input.reviewNextAt
    if (input.reviewInterval !== undefined) record.review.interval = input.reviewInterval
    if (input.attempt !== undefined) {
      record.attempts.push({ at, mode: input.attempt.mode, answer: input.attempt.answer, verdict: input.attempt.verdict })
      events.push('attempt ' + input.attempt.mode)
    }
    if (input.patch !== undefined) {
      for (const [key, value] of Object.entries(input.patch)) {
        if (key === 'schema' || key === 'id' || key === 'history') continue
        ;(record as unknown as Record<string, unknown>)[key] = value
        events.push('patch ' + key)
      }
    }
    record.updatedAt = at
    for (const event of events.length > 0 ? events : ['updated']) record.history.push({ at, event })
    await writeFileAtomic(file, JSON.stringify(record, null, 2) + '\n', { mode: 0o600, dirMode: 0o700 })
    return record
  })
}

/** One-line summary used by `bank_list`. */
export function summarizeProblem(record: ProblemRecord): string {
  const statement = record.statement.replace(/\s+/gu, ' ').slice(0, 40)
  return [record.id, record.status, record.subject, record.createdAt.slice(0, 10), statement].join(' | ')
}

/** Counts and the stalest problems. */
export interface BankStats {
  total: number
  byStatus: Record<string, number>
  bySubject: Record<string, number>
  stalest: { id: string; status: string; updatedAt: string }[]
}

/**
 * Aggregate the whole bank.
 * @param records - readable records.
 * @param limit - how many stalest problems to report.
 */
export function summarizeStats(records: ProblemRecord[], limit = 5): BankStats {
  const byStatus: Record<string, number> = {}
  const bySubject: Record<string, number> = {}
  for (const record of records) {
    byStatus[record.status] = (byStatus[record.status] ?? 0) + 1
    bySubject[record.subject] = (bySubject[record.subject] ?? 0) + 1
  }
  const stalest = [...records]
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .slice(0, limit)
    .map(record => ({ id: record.id, status: record.status, updatedAt: record.updatedAt }))
  return { total: records.length, byStatus, bySubject, stalest }
}
