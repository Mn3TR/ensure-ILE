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

import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomic, withFileLock } from '@deepseek-ai/dsh-atomic-write'

/** Statuses a problem can carry. */
export const PROBLEM_STATUSES = ['new', 'guide', 'hrl', 'review', 'mastered', 'parked'] as const
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number]

/** Record file inside one problem folder. */
export const PROBLEM_FILE = 'problem.json'

/** Derived table of contents beside the problem folders. */
export const BANK_INDEX_FILE = 'index.json'

/** Image folder inside one problem folder. */
export const IMAGES_DIR = 'images'

/** Source formats accepted for problem pictures, matching the inbound pipeline. */
export const PROBLEM_IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
export type ProblemImageMediaType = (typeof PROBLEM_IMAGE_MEDIA_TYPES)[number]

/** One picture copied into a problem folder. */
export interface ProblemAttachment {
  /** Path relative to the problem folder, `images/<sha256>.<ext>`. */
  file: string
  /** Digest of the stored bytes; the file name without its extension. */
  sha256: string
  mediaType: ProblemImageMediaType
  bytes: number
  width?: number
  height?: number
  addedAt: string
}

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
  /** What the learner wrote at the end of the session, verbatim. */
  result?: string
  /** How the learner came across this session; the cheapest learner signal we keep. */
  affect?: Affect
  /** Which rung of the hint ladder actually moved him. */
  effectiveHint?: HintLevel
}

/** How the learner seemed during one session. */
export const AFFECTS = ['frustrated', 'neutral', 'excited'] as const
export type Affect = (typeof AFFECTS)[number]

/**
 * The five rungs of guide.md's hint ladder, lightest first. Recorded per session
 * so the next guide knows what actually moved this learner.
 */
export const HINT_LEVELS = ['confirm', 'position', 'feature', 'structure', 'result'] as const
export type HintLevel = (typeof HINT_LEVELS)[number]

/** Fixed review intervals in days; the scheduler walks this ladder. */
export const REVIEW_LADDER = [1, 3, 7, 14, 30, 60, 120] as const

/** One handed-in answer from a session where the learner worked alone. */
export interface ProblemAttempt {
  at: string
  answer: string
  verdict: string
  source: 'text'
}

/** One step of the teacher's trajectory. */
export interface TeacherStep {
  index: number
  body: string
  reason: string
}

/** The teacher's own complete solution, written once per problem. */
export interface TeacherTrajectory {
  writtenAt: string
  answer: string
  /** Why it was written this way. Optional; fill it only when it is not obvious. */
  note?: string
  steps: TeacherStep[]
}

/** How one teacher step lines up with the learner's own words. */
export const PAIRING_MATCHES = ['same', 'partial', 'missing'] as const
export type PairingMatch = (typeof PAIRING_MATCHES)[number]

/** Which side the learner kept for one step. */
export const PAIRING_CHOICES = ['student', 'teacher', 'merged'] as const
export type PairingChoice = (typeof PAIRING_CHOICES)[number]

/** One aligned step of the learner's rollout against the teacher's trajectory. */
export interface PairingStep {
  index: number
  /** The learner's own words, verbatim. Absent when the step is missing. */
  studentQuote?: string
  /** Index into the teacher's steps. */
  teacherStep?: number
  match: PairingMatch
  chosen?: PairingChoice
  /** The learner's rewrite, present only when `chosen` is `merged`. */
  mergedText?: string
  chosenAt?: string
  note?: string
}

/** One pass of step-by-step A/B over one handed-in answer. */
export interface Pairing {
  at: string
  attemptAt?: string
  steps: PairingStep[]
  /** The solution assembled from the choices; present once the pass closes. */
  result?: string
}

/** The answer-optimization state, present once HRL touched this problem. */
export interface HrlState {
  input?: {
    at: string
    from: 'work' | 'pasted'
    attemptAt?: string
    answer: string
  }
  teacher?: TeacherTrajectory
  pairings: Pairing[]
}

/** What one mode leaves for the next one. At most one may be unconsumed. */
export interface Handoff {
  id: string
  at: string
  from: string
  to: string
  why: string
  state: string
  detail?: { lastWords?: string; blocker?: string; nextStep?: string }
  /** Set when a session accepted it; clear it to make the package selectable again. */
  consumedAt?: string
  consumerSessionId?: string
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

/** A whole problem record. Each mode owns its own section. */
export interface ProblemRecord {
  schema: 2
  id: string
  subject: string
  tags: string[]
  statement: string
  attachments: ProblemAttachment[]
  status: ProblemStatus
  createdAt: string
  updatedAt: string
  guide: { sessions: GuideSession[]; insight?: string }
  work: { attempts: ProblemAttempt[] }
  hrl?: HrlState
  handoff?: Handoff
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

/** Folder of one problem; the id is the folder name. */
export function problemDir(directory: string, id: string): string {
  if (!/^[a-z0-9-]+$/u.test(id)) throw new BankError('题目 id 不合法：' + id, 'invalid-id')
  return join(directory, id)
}

/** Path of the record inside one problem folder. */
export function problemPath(directory: string, id: string): string {
  return join(problemDir(directory, id), PROBLEM_FILE)
}

/** File extension for one accepted image type. */
export function mediaTypeExtension(mediaType: string): string {
  switch (mediaType) {
    case 'image/png': return 'png'
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    default: throw new BankError('不支持的图片类型：' + mediaType, 'invalid-input')
  }
}

/** Relative path one stored image keeps inside its problem folder. */
export function imageRelPath(sha256: string, mediaType: string): string {
  return IMAGES_DIR + '/' + sha256 + '.' + mediaTypeExtension(mediaType)
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new BankError('字段 ' + field + ' 必须是字符串', 'invalid-record')
  return value
}

function asArray<T>(value: unknown, field: string): T[] {
  if (!Array.isArray(value)) throw new BankError('字段 ' + field + ' 必须是数组', 'invalid-record')
  return value as T[]
}

/** Validate the picture list; an older record's empty list stays valid. */
function parseAttachments(raw: unknown): ProblemAttachment[] {
  if (!Array.isArray(raw)) throw new BankError('字段 attachments 必须是数组', 'invalid-record')
  return raw.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) throw new BankError('attachments 的条目必须是对象', 'invalid-record')
    const value = entry as Record<string, unknown>
    const recorded = asString(value.file, 'attachments.file')
    const sha256 = asString(value.sha256, 'attachments.sha256')
    const mediaType = asString(value.mediaType, 'attachments.mediaType')
    if (!/^images\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/u.test(recorded)) {
      throw new BankError('attachments.file 必须是 images/<sha256>.<ext>：' + recorded, 'invalid-record')
    }
    if (!(PROBLEM_IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
      throw new BankError('未知图片类型 ' + mediaType, 'invalid-record')
    }
    return {
      file: recorded,
      sha256,
      mediaType: mediaType as ProblemImageMediaType,
      bytes: typeof value.bytes === 'number' ? value.bytes : 0,
      ...(typeof value.width === 'number' ? { width: value.width } : {}),
      ...(typeof value.height === 'number' ? { height: value.height } : {}),
      addedAt: asString(value.addedAt, 'attachments.addedAt'),
    }
  })
}

/**
 * Validate one parsed file. Corrupt files are the caller's to skip; this throws
 * so the message names the exact field that broke.
 * @param raw - parsed JSON of one problem file.
 */
export function parseRecord(raw: unknown): ProblemRecord {
  if (typeof raw !== 'object' || raw === null) throw new BankError('题目文件不是对象', 'invalid-record')
  const value = raw as Record<string, unknown>
  if (value.schema !== 2) throw new BankError('schema 必须是 2（v1 文件需要手工迁移）', 'invalid-record')
  const status = asString(value.status, 'status')
  if (!isProblemStatus(status)) throw new BankError('未知状态 ' + status, 'invalid-record')
  const guide = value.guide
  if (typeof guide !== 'object' || guide === null) throw new BankError('guide 必须是对象', 'invalid-record')
  const work = value.work
  if (typeof work !== 'object' || work === null) throw new BankError('work 必须是对象', 'invalid-record')
  const review = value.review
  if (typeof review !== 'object' || review === null) throw new BankError('review 必须是对象', 'invalid-record')
  const hrl = value.hrl
  if (hrl !== undefined && (typeof hrl !== 'object' || hrl === null)) throw new BankError('hrl 必须是对象', 'invalid-record')
  const handoff = value.handoff
  if (handoff !== undefined && (typeof handoff !== 'object' || handoff === null)) throw new BankError('handoff 必须是对象', 'invalid-record')
  const record: ProblemRecord = {
    schema: 2,
    id: asString(value.id, 'id'),
    subject: asString(value.subject, 'subject'),
    tags: asArray<string>(value.tags ?? [], 'tags'),
    statement: asString(value.statement, 'statement'),
    attachments: parseAttachments(value.attachments ?? []),
    status,
    createdAt: asString(value.createdAt, 'createdAt'),
    updatedAt: asString(value.updatedAt, 'updatedAt'),
    guide: guide as ProblemRecord['guide'],
    work: work as ProblemRecord['work'],
    review: review as ProblemRecord['review'],
    history: asArray<HistoryEntry>(value.history ?? [], 'history'),
  }
  if (hrl !== undefined) record.hrl = hrl as HrlState
  if (handoff !== undefined) record.handoff = handoff as Handoff
  return record
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
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    try {
      records.push(parseRecord(JSON.parse(readFileSync(join(directory, entry.name, PROBLEM_FILE), 'utf8'))))
    } catch (error) {
      skipped.push({ file: entry.name, reason: error instanceof Error ? error.message : String(error) })
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
  /** Pictures already copied into the problem folder. */
  attachments?: ProblemAttachment[]
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
    if (!existsSync(problemDir(directory, candidate))) {
      id = candidate
      break
    }
  }
  if (id.length === 0) throw new BankError('生成题目 id 失败，请重试', 'id-collision')
  const record: ProblemRecord = {
    schema: 2,
    id,
    subject,
    tags: input.tags ?? [],
    statement,
    attachments: input.attachments ?? [],
    status: 'new',
    createdAt: at,
    updatedAt: at,
    guide: { sessions: [] },
    work: { attempts: [] },
    review: { count: 0, history: [] },
    history: [{ at, event: 'created' }],
  }
  mkdirSync(problemDir(directory, id), { recursive: true })
  await writeFileAtomic(problemPath(directory, id), JSON.stringify(record, null, 2) + '\n', { mode: 0o600, dirMode: 0o700 })
  await rebuildIndex(directory)
  return record
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
export async function saveProblemImage(
  directory: string,
  id: string,
  input: { data: Uint8Array; mediaType: ProblemImageMediaType; width?: number; height?: number; now?: Date },
): Promise<ProblemAttachment> {
  const sha256 = createHash('sha256').update(input.data).digest('hex')
  const file = imageRelPath(sha256, input.mediaType)
  const folder = problemDir(directory, id)
  mkdirSync(join(folder, IMAGES_DIR), { recursive: true })
  const target = join(folder, file)
  if (!existsSync(target)) {
    await writeFileAtomic(target, input.data, { mode: 0o600, dirMode: 0o700 })
  }
  return {
    file,
    sha256,
    mediaType: input.mediaType,
    bytes: input.data.byteLength,
    ...(input.width === undefined ? {} : { width: input.width }),
    ...(input.height === undefined ? {} : { height: input.height }),
    addedAt: (input.now ?? new Date()).toISOString(),
  }
}

/**
 * Read one picture back out of a problem folder.
 * @param directory - bank directory.
 * @param id - problem id.
 * @param attachment - the entry from the record.
 * @returns the exact stored bytes.
 * @throws a BankError when the file is missing or no longer matches its digest.
 */
export function readProblemImage(directory: string, id: string, attachment: ProblemAttachment): Uint8Array {
  const target = join(problemDir(directory, id), attachment.file)
  if (!existsSync(target)) throw new BankError('题目图片缺失：' + id + '/' + attachment.file, 'not-found')
  const data = readFileSync(target)
  const digest = createHash('sha256').update(data).digest('hex')
  if (digest !== attachment.sha256) throw new BankError('题目图片与记录不符：' + id + '/' + attachment.file, 'corrupt')
  return data
}

/** One picture handed to {@link attachProblemImages}. */
export interface ProblemImageInput {
  data: Uint8Array
  mediaType: ProblemImageMediaType
  width?: number
  height?: number
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
export async function attachProblemImages(
  directory: string,
  id: string,
  images: readonly ProblemImageInput[],
): Promise<ProblemRecord> {
  if (images.length === 0) return readProblem(directory, id)
  return withFileLock(join(problemDir(directory, id), '.lock'), async () => {
    const record = readProblem(directory, id)
    const at = new Date().toISOString()
    const events: string[] = []
    for (const image of images) {
      const entry = await saveProblemImage(directory, id, image)
      if (record.attachments.some(existing => existing.sha256 === entry.sha256)) continue
      record.attachments.push(entry)
      events.push('image ' + entry.sha256.slice(0, 12))
    }
    if (events.length === 0) return record
    record.updatedAt = at
    for (const event of events) record.history.push({ at, event })
    await writeFileAtomic(problemPath(directory, id), JSON.stringify(record, null, 2) + '\n', { mode: 0o600, dirMode: 0o700 })
    return record
  })
}

/** What one legacy migration pass did. */
export interface LegacyMigration {
  migrated: string[]
  skipped: { file: string; reason: string }[]
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
export function migrateLegacyProblems(directory: string): LegacyMigration {
  const result: LegacyMigration = { migrated: [], skipped: [] }
  if (!existsSync(directory)) return result
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() && entry.name.endsWith('.json') && entry.name !== BANK_INDEX_FILE) {
      const file = entry.name
      const id = file.slice(0, -'.json'.length)
      if (!/^[a-z0-9-]+$/u.test(id)) {
        result.skipped.push({ file, reason: '不是合法的题目 id' })
        continue
      }
      const legacy = join(directory, file)
      if (existsSync(problemPath(directory, id))) {
        renameSync(legacy, legacy + '.migrated')
        result.skipped.push({ file, reason: '目标文件夹已存在，旧文件改名为 .migrated' })
        continue
      }
      let raw: unknown
      try {
        raw = JSON.parse(readFileSync(legacy, 'utf8'))
      } catch (error) {
        result.skipped.push({ file, reason: error instanceof Error ? error.message : String(error) })
        continue
      }
      try {
        const record = parseRecord(raw)
        if (record.id !== id) throw new BankError('记录里的 id 与文件名不一致：' + record.id, 'invalid-record')
        const folder = problemDir(directory, id)
        mkdirSync(folder, { recursive: true })
        const target = problemPath(directory, id)
        if (!existsSync(target)) writeFileSync(target, JSON.stringify(record, null, 2) + '\n')
        const readBack = readProblem(directory, id)
        if (readBack.id !== id) throw new BankError('迁移后读回的 id 不对：' + readBack.id, 'invalid-record')
        renameSync(legacy, legacy + '.migrated')
        result.migrated.push(id)
      } catch (error) {
        result.skipped.push({ file, reason: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  return result
}

/** One handed-in answer from work mode. */
export interface WorkAttemptInput {
  answer: string
  verdict: string
}

/** One incremental write into the answer-optimization section. */
export interface HrlUpdateInput {
  input?: HrlState['input']
  teacher?: TeacherTrajectory
  step?: PairingStep
  result?: string
}

/** A handoff to write; the id is minted when absent. */
export interface HandoffInput {
  id?: string
  from: string
  to: string
  why: string
  state: string
  detail?: Handoff['detail']
}

/** Fields a caller may change explicitly; everything else goes through `patch`. */
export interface UpdateProblemInput {
  status?: string
  guideOutcome?: string
  whereStuck?: string
  guideResult?: string
  insight?: string
  reviewNextAt?: string
  reviewInterval?: number
  /** A review sitting: true walks one rung up, false resets to the first. */
  reviewPassed?: boolean
  affect?: string
  effectiveHint?: string
  workAttempt?: WorkAttemptInput
  hrl?: HrlUpdateInput
  handoff?: HandoffInput
  /** Session id accepting the pending handoff; an empty string releases it. */
  handoffConsume?: string
  patch?: Record<string, unknown>
  now?: Date
}

/** One rung up the review ladder; the last rung repeats. */
function nextInterval(current: number | undefined): number {
  if (current === undefined) return REVIEW_LADDER[0]
  const index = REVIEW_LADDER.indexOf(current as never)
  if (index < 0) return REVIEW_LADDER[0]
  return REVIEW_LADDER[Math.min(index + 1, REVIEW_LADDER.length - 1)] as number
}

/** The last pairing still waiting for its result. */
function openPairing(hrl: HrlState): Pairing | undefined {
  for (let index = hrl.pairings.length - 1; index >= 0; index -= 1) {
    const pairing = hrl.pairings[index]
    if (pairing !== undefined && pairing.result === undefined) return pairing
  }
  return undefined
}

/** Apply one HRL write; steps land in the open pairing, which `result` closes. */
function applyHrl(record: ProblemRecord, input: HrlUpdateInput, at: string): string[] {
  const events: string[] = []
  const hrl = record.hrl ?? (record.hrl = { pairings: [] })
  if (input.input !== undefined) {
    hrl.input = input.input
    events.push('hrl input ' + input.input.from)
  }
  if (input.teacher !== undefined) {
    hrl.teacher = input.teacher
    events.push('hrl teacher ' + input.teacher.steps.length + ' steps')
  }
  if (input.step !== undefined) {
    let pairing = openPairing(hrl)
    if (pairing === undefined) {
      pairing = { at, steps: [] }
      hrl.pairings.push(pairing)
    }
    const step = input.step
    const existing = pairing.steps.findIndex(entry => entry.index === step.index)
    if (existing >= 0) pairing.steps[existing] = step
    else pairing.steps.push(step)
    pairing.steps.sort((left, right) => left.index - right.index)
    events.push('hrl step ' + step.index + ' ' + step.match)
  }
  if (input.result !== undefined) {
    const pairing = openPairing(hrl)
    if (pairing === undefined) throw new BankError('没有进行中的对比，先写步骤再写结果', 'invalid-input')
    pairing.result = input.result
    events.push('hrl result')
  }
  return events
}

/** Write a handoff, dropping whatever unconsumed package it replaces. */
function applyHandoff(record: ProblemRecord, input: HandoffInput, at: string): string[] {
  const events: string[] = []
  const previous = record.handoff
  if (previous !== undefined && previous.consumedAt === undefined) events.push('handoff dropped ' + previous.id)
  record.handoff = {
    id: input.id ?? 'hlt-' + randomBytes(3).toString('hex'),
    at,
    from: input.from,
    to: input.to,
    why: input.why,
    state: input.state,
    ...(input.detail === undefined ? {} : { detail: input.detail }),
  }
  events.push('handoff -> ' + input.to)
  return events
}

/** Mark the handoff accepted, or clear that mark so the package is selectable again. */
function consumeHandoff(record: ProblemRecord, sessionId: string, at: string): string[] {
  const handoff = record.handoff
  if (handoff === undefined) throw new BankError('题库里没有待接收的交接', 'invalid-input')
  if (sessionId.length === 0) {
    delete handoff.consumedAt
    delete handoff.consumerSessionId
    return ['handoff released']
  }
  handoff.consumedAt = at
  handoff.consumerSessionId = sessionId
  return ['handoff consumed by ' + sessionId]
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
  return withFileLock(join(problemDir(directory, id), '.lock'), async () => {
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
    if (input.guideResult !== undefined) {
      const open = record.guide.sessions.find(session => session.endedAt === undefined)
        ?? record.guide.sessions[record.guide.sessions.length - 1]
      if (open === undefined) throw new BankError('没有可写入的引导会话', 'invalid-input')
      open.result = input.guideResult
      events.push('guide result')
    }
    if (input.insight !== undefined) record.guide.insight = input.insight
    if (input.affect !== undefined || input.effectiveHint !== undefined) {
      // Signals are written mid-session, usually before the session has an
      // outcome, so open one rather than refusing the write.
      let open = record.guide.sessions.find(session => session.endedAt === undefined)
        ?? record.guide.sessions[record.guide.sessions.length - 1]
      if (open === undefined) {
        open = { startedAt: at }
        record.guide.sessions.push(open)
        events.push('guide session opened')
      }
      if (input.affect !== undefined) {
        if (!(AFFECTS as readonly string[]).includes(input.affect)) {
          throw new BankError('未知情绪 ' + input.affect, 'invalid-input')
        }
        open.affect = input.affect as Affect
        events.push('affect ' + input.affect)
      }
      if (input.effectiveHint !== undefined) {
        if (!(HINT_LEVELS as readonly string[]).includes(input.effectiveHint)) {
          throw new BankError('未知视角档位 ' + input.effectiveHint, 'invalid-input')
        }
        open.effectiveHint = input.effectiveHint as HintLevel
        events.push('effectiveHint ' + input.effectiveHint)
      }
    }
    if (input.reviewNextAt !== undefined) record.review.nextAt = input.reviewNextAt
    if (input.reviewInterval !== undefined) record.review.interval = input.reviewInterval
    if (input.reviewPassed !== undefined) {
      const step = input.reviewPassed ? nextInterval(record.review.interval) : REVIEW_LADDER[0]
      record.review.interval = step
      record.review.count = input.reviewPassed ? record.review.count + 1 : 0
      record.review.nextAt = new Date(now.getTime() + step * 86_400_000).toISOString()
      record.review.history.push(at + ' ' + (input.reviewPassed ? 'pass' : 'fail') + ' +' + step + 'd')
      events.push('review ' + (input.reviewPassed ? 'pass' : 'fail') + ' +' + step + 'd')
      if (input.reviewPassed && step === REVIEW_LADDER[REVIEW_LADDER.length - 1]) {
        record.status = 'mastered'
        events.push('status -> mastered')
      }
    } else if (record.status === 'review' && record.review.nextAt === undefined) {
      // Entering review schedules the first sitting; the ladder then walks itself.
      record.review.interval = REVIEW_LADDER[0]
      record.review.nextAt = new Date(now.getTime() + REVIEW_LADDER[0] * 86_400_000).toISOString()
      events.push('review scheduled +' + REVIEW_LADDER[0] + 'd')
    }
    if (input.workAttempt !== undefined) {
      record.work.attempts.push({
        at,
        answer: input.workAttempt.answer,
        verdict: input.workAttempt.verdict,
        source: 'text',
      })
      events.push('work attempt ' + input.workAttempt.verdict)
    }
    if (input.hrl !== undefined) events.push(...applyHrl(record, input.hrl, at))
    if (input.handoff !== undefined) events.push(...applyHandoff(record, input.handoff, at))
    if (input.handoffConsume !== undefined) events.push(...consumeHandoff(record, input.handoffConsume, at))
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

/** True when this problem carries a handoff no session has accepted yet. */
export function hasPendingHandoff(record: ProblemRecord): boolean {
  return record.handoff !== undefined && record.handoff.consumedAt === undefined
}

/**
 * Every problem carrying a handoff nobody accepted yet.
 * @param records - readable records.
 * @returns the id and package of each pending handoff, newest first.
 */
export function pendingHandoffs(records: ProblemRecord[]): { id: string; handoff: Handoff }[] {
  return records
    .filter(hasPendingHandoff)
    .map(record => ({ id: record.id, handoff: record.handoff as Handoff }))
    .sort((left, right) => right.handoff.at.localeCompare(left.handoff.at))
}

/** The part of one problem the next mode needs to pick it up. */
export interface ResumeView {
  id: string
  statement: string
  subject: string
  status: ProblemStatus
  insight?: string
  handoff?: Handoff
  lastAttempt?: ProblemAttempt
  guideResult?: string
}

/**
 * Build the resume package for one problem.
 * @param record - the problem.
 * @returns statement, handoff, insight and the last answer, nothing else.
 */
export function resumeView(record: ProblemRecord): ResumeView {
  const session = record.guide.sessions[record.guide.sessions.length - 1]
  const attempt = record.work.attempts[record.work.attempts.length - 1]
  return {
    id: record.id,
    statement: record.statement,
    subject: record.subject,
    status: record.status,
    ...(record.guide.insight === undefined ? {} : { insight: record.guide.insight }),
    ...(record.handoff === undefined ? {} : { handoff: record.handoff }),
    ...(attempt === undefined ? {} : { lastAttempt: attempt }),
    ...(session?.result === undefined ? {} : { guideResult: session.result }),
  }
}

/** One-line summary used by `bank_list`; a pending handoff is named so the list can offer it. */
export function summarizeProblem(record: ProblemRecord): string {
  const statement = record.statement.replace(/\s+/gu, ' ').slice(0, 40)
  const pending = hasPendingHandoff(record) && record.handoff !== undefined
    ? ' -> ' + record.handoff.to + ' 待接'
    : ''
  return [record.id, record.status, record.subject, record.createdAt.slice(0, 10), statement].join(' | ') + pending
}

/**
 * When the next review sitting is due, as a millisecond stamp.
 * Undefined when the problem has no schedule yet or the stamp is unreadable.
 * @param record - the problem.
 */
export function reviewDueAt(record: ProblemRecord): number | undefined {
  const raw = record.review.nextAt
  if (raw === undefined || raw.length === 0) return undefined
  const at = Date.parse(raw)
  return Number.isNaN(at) ? undefined : at
}

/**
 * True when a review sitting has come due. mastered/parked never come up again;
 * every other status does once its date arrives. Pass an end-of-day stamp to ask
 * "还差今天这几小时算不算到期".
 * @param record - the problem.
 * @param now - the instant to compare against.
 */
export function isReviewDue(record: ProblemRecord, now: Date = new Date()): boolean {
  if (record.status === 'mastered' || record.status === 'parked') return false
  const at = reviewDueAt(record)
  return at !== undefined && at <= now.getTime()
}

/** Counts and the stalest problems. */
export interface BankStats {
  total: number
  byStatus: Record<string, number>
  bySubject: Record<string, number>
  /** Problems whose handoff no session has accepted yet. */
  pendingHandoffs: number
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
  let pendingHandoffs = 0
  for (const record of records) {
    byStatus[record.status] = (byStatus[record.status] ?? 0) + 1
    bySubject[record.subject] = (bySubject[record.subject] ?? 0) + 1
    if (hasPendingHandoff(record)) pendingHandoffs += 1
  }
  const stalest = [...records]
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .slice(0, limit)
    .map(record => ({ id: record.id, status: record.status, updatedAt: record.updatedAt }))
  return { total: records.length, byStatus, bySubject, pendingHandoffs, stalest }
}

/** The derived table of contents: which problems the folder directory holds. */
export interface BankIndex {
  schema: 1
  updatedAt: string
  /** Problem ids in folder order, which is creation order. */
  problems: string[]
}

/** Path of the bank index inside the problem directory. */
export function indexPath(directory: string): string {
  return join(directory, BANK_INDEX_FILE)
}

/**
 * Read the index, or nothing when it is missing or unreadable.
 * @param directory - bank directory.
 * @returns the index, if it parses.
 */
export function readBankIndex(directory: string): BankIndex | undefined {
  const file = indexPath(directory)
  if (!existsSync(file)) return undefined
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    if (raw['schema'] !== 1 || !Array.isArray(raw['problems'])) return undefined
    return {
      schema: 1,
      updatedAt: typeof raw['updatedAt'] === 'string' ? raw['updatedAt'] : '',
      problems: raw['problems'].filter((id): id is string => typeof id === 'string'),
    }
  } catch {
    return undefined
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
export async function rebuildIndex(directory: string, now: Date = new Date()): Promise<BankIndex> {
  const problems = existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
    : []
  const index: BankIndex = { schema: 1, updatedAt: now.toISOString(), problems }
  mkdirSync(directory, { recursive: true })
  await writeFileAtomic(indexPath(directory), JSON.stringify(index, null, 2) + '\n', { mode: 0o600, dirMode: 0o700 })
  return index
}

/** True when the index already names exactly these ids. */
export function indexIsCurrent(index: BankIndex | undefined, ids: readonly string[]): boolean {
  if (index === undefined || index.problems.length !== ids.length) return false
  return index.problems.every((id, position) => id === ids[position])
}
