/**
 * Schedule row for ensure-ILE: the timetable and progress that turn "what should
 * I do today" into an answer.
 *
 * Three tools live here — read, update, plan. The schedule itself is one JSON
 * file under the Harness home, so guide / work / HRL sessions all see the same
 * record. The plan reads two neighbouring packages: the problem bank (which
 * problems are due) and the textbook corpus (which pages to read before the next
 * lesson). This row is the only place those imports happen; plan.ts and store.ts
 * stay pure so the tests can run without any host.
 *
 * No prompt section is registered: guide / work / HRL replace the whole prompt,
 * so the usage rules have to live in the tool descriptions.
 * @module dsh-plugin-schedule
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { defaultBankDirectory, listProblems } from 'dsh-plugin-bankmanager/store'
import { createBookStore } from 'dsh-plugin-textbook/data'
import { formatLocalDate, isValidDate, weekdayName } from './dates.ts'
import {
  plan,
  renderPlan,
  type BankProblem,
  type BankReader,
  type BookReader,
  type PlanDeps,
} from './plan.ts'
import {
  defaultScheduleFile,
  loadSchedule,
  ScheduleError,
  updateSchedule,
  type ScheduleState,
} from './store.ts'

/** Cordis plugin name. */
export const name = 'plugin-schedule'

/** Only the tool registry is needed: the schedule has no browser half in v1. */
export const inject = ['tools']

/** Runtime schema for the schedule row. */
export const Config = z.object({
  /** Absolute schedule file; empty means <DSH_HOME>/schedule/schedule.json. */
  file: z.string().default(''),
  /** Absolute bank directory; empty means <DSH_HOME>/bank/problems. */
  bankDirectory: z.string().default(''),
  /** Absolute textbook corpus directory; empty means the textbook package default. */
  textbookData: z.string().default(''),
})

/** Resolved configuration shape. */
export interface Config {
  file?: string
  bankDirectory?: string
  textbookData?: string
}

/** Model-facing text for a failure. */
function explain(error: unknown): string {
  if (error instanceof ScheduleError) return error.code + ': ' + error.message
  return 'schedule error: ' + (error instanceof Error ? error.message : String(error))
}

function empty(value: string | undefined): boolean {
  return value === undefined || value.length === 0
}

/** Build the textbook reader lazily: a missing corpus must not break the row. */
function createTextbookReader(dataDirectory: string | undefined): () => BookReader | undefined {
  let cached: BookReader | undefined
  let loaded = false
  return () => {
    if (loaded) return cached
    loaded = true
    try {
      const store = empty(dataDirectory) ? createBookStore() : createBookStore({ dataDirectory: dataDirectory as string })
      cached = {
        book: (bookId) => {
          try {
            const book = store.readBook(bookId)
            return { id: book.id, title: book.title, textbookOffset: book.textbookOffset }
          } catch { return undefined }
        },
        startSection: (bookId) => {
          try { return store.readBook(bookId).sections.at(0) } catch { return undefined }
        },
        nextSection: (bookId, afterTitle) => {
          try { return store.nextSection(bookId, afterTitle) } catch { return undefined }
        },
      }
    } catch {
      // 语料目录不存在就退化成「教材不可用」，工具照常给章节标题。
      cached = undefined
    }
    return cached
  }
}

function line(label: string, value: string): string {
  return label + '：' + value
}

/** Render one part of the record as text. */
function renderRead(state: ScheduleState, file: string, corrupted: boolean, part: string): string {
  const lines: string[] = []
  if (corrupted) lines.push('文件读不出来，已经当作空记录：' + file)

  const wanted = part === 'all' ? 'all' : part
  if (wanted === 'all' || wanted === 'subjects') {
    lines.push('【科目】' + String(state.subjects.length) + ' 个')
    if (state.subjects.length === 0) lines.push('  还没录科目——schedule_update 的 subjects 可以一次加一个。')
    for (const subject of state.subjects) {
      lines.push('  ' + subject.id + ' · ' + subject.name
        + (subject.bookId === undefined ? ' · 未绑定教材' : ' · 教材 ' + subject.bookId)
        + (subject.note === undefined ? '' : ' · ' + subject.note))
    }
  }

  if (wanted === 'all' || wanted === 'timetable') {
    const weekly = state.timetable.weekly
    lines.push('【课表】' + String(weekly.length) + ' 节/周')
    if (weekly.length === 0) lines.push('  还没录课表——schedule_update 的 weekly 传整份，addLessons 单独加几节。')
    for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
      const day = weekly.filter(lesson => lesson.weekday === weekday)
      if (day.length === 0) continue
      const slots = day.map(lesson => '第 ' + String(lesson.slot) + ' 节 ' + lesson.subject
        + (lesson.note === undefined ? '' : '（' + lesson.note + '）'))
      lines.push('  ' + weekdayName(weekday) + '：' + slots.join('、'))
    }
  }

  if (wanted === 'all' || wanted === 'pace') {
    lines.push('【节奏】每次课推进几节')
    const ids = Object.keys(state.pace)
    if (ids.length === 0) lines.push('  没设过，默认每课 1 节。')
    for (const id of ids) {
      lines.push('  ' + id + '：' + String(state.pace[id]?.perLesson ?? 1) + ' 节/课')
    }
  }

  if (wanted === 'all' || wanted === 'progress') {
    lines.push('【进度】')
    const ids = Object.keys(state.progress)
    if (ids.length === 0) lines.push('  还没录进度——schedule_update 的 progress 写「讲到哪一节」。')
    for (const id of ids) {
      const entry = state.progress[id]
      if (entry === undefined) continue
      lines.push('  ' + id + '：' + entry.section + (entry.at.length === 0 ? '' : '（' + entry.at + ' 记）'))
    }
  }

  if (wanted === 'all' || wanted === 'exceptions') {
    lines.push('【例外】' + String(state.exceptions.length) + ' 天')
    if (state.exceptions.length === 0) lines.push('  没有例外。')
    for (const exception of state.exceptions) {
      const kind = exception.kind === 'holiday' ? '放假' : exception.kind === 'exam' ? '考试日' : '调课'
      lines.push('  ' + exception.date + ' · ' + kind
        + (exception.subject === undefined ? ' · 整天' : ' · 只有 ' + exception.subject)
        + (exception.note === undefined ? '' : ' · ' + exception.note))
    }
  }

  if (state.updatedAt !== undefined) lines.push('', '最后更新：' + state.updatedAt)
  lines.push(line('文件', file))
  return lines.join('\n')
}

/**
 * Mount the schedule tools on this scope.
 * @param ctx - profile-root context; the row registers host-wide tools.
 * @param config - where the schedule file, bank and corpus live.
 */
export function apply(ctx: Context, config: Config): void {
  const file = empty(config.file) ? defaultScheduleFile() : config.file as string
  const bankDirectory = empty(config.bankDirectory) ? defaultBankDirectory() : config.bankDirectory as string
  const textbook = createTextbookReader(config.textbookData)

  ctx.tools.register(defineTool({
    name: 'schedule_read',
    description: [
      '读课表与进度的现状：科目、每周课表、每课推进几节、各科讲到哪一节、以及放假/调课/考试日。',
      '用在：开学第一次见面、学生说「今天该干什么」而你还没看过课表、或者刚改完课表想确认一下。',
      '缺什么会直接说（还没录课表 / 还没录进度），别猜；part 省略等于全部。',
    ].join('\n'),
    parameters: {
      part: { type: 'string', description: '只看一块：all（默认）/ timetable / progress / subjects / pace / exceptions' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => {
      try {
        const { state, corrupted } = loadSchedule(file)
        const part = args.part === undefined || args.part.length === 0 ? 'all' : args.part
        return renderRead(state, file, corrupted, part)
      } catch (error) {
        return explain(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'schedule_update',
    description: [
      '按字段改课表与进度：加/改科目（含绑定的教材 bookId）、换整份课表或单独加几节、设每课推进几节、更新各科讲到哪一节、加删放假/调课/考试日。',
      '用在：学生告诉你课表、说「数学讲到一节半了」、老师调课或者明天放假。',
      '只改你传的字段，没传的原样不动；weekly 是整个星期的替换，addLessons 是单加几节（同一天同一节以新的为准）。',
      '留空字符串等于解绑（bookId、note）；科目 id 一旦用过就别改，进度和课表都挂在它上面。',
    ].join('\n'),
    parameters: {
      subjects: {
        type: 'array',
        description: '加或改科目；id 已存在就更新名字/教材/备注',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true, description: '科目 id，如 math / chem / physics，自由字符串' },
            name: { type: 'string', required: true, description: '显示名，如 数学' },
            bookId: { type: 'string', description: '绑定的教材 id，如 renjiaoA-math-1；空字符串解绑' },
            note: { type: 'string', description: '备注，空字符串清除' },
          },
        },
      },
      removeSubjects: {
        type: 'array',
        description: '删掉这些科目的记录（连同课表里的课、节奏和进度）',
        items: { type: 'string' },
      },
      weekly: {
        type: 'array',
        description: '整份替换每周课表；传空数组等于清空',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            weekday: { type: 'integer', required: true, description: '1–7，周一=1，周日=7' },
            slot: { type: 'integer', required: true, description: '当天第几节，从 1 开始' },
            subject: { type: 'string', required: true, description: '科目 id' },
            note: { type: 'string', description: '备注（连堂、合班…）' },
          },
        },
      },
      addLessons: {
        type: 'array',
        description: '只加/改几节；同一天同一节会被替换',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            weekday: { type: 'integer', required: true, description: '1–7，周一=1' },
            slot: { type: 'integer', required: true, description: '当天第几节' },
            subject: { type: 'string', required: true, description: '科目 id' },
            note: { type: 'string', description: '备注' },
          },
        },
      },
      pace: {
        type: 'array',
        description: '设某个科目每次课推进几节（默认 1）',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            subject: { type: 'string', required: true, description: '科目 id' },
            perLesson: { type: 'integer', required: true, description: '1–10' },
          },
        },
      },
      progress: {
        type: 'array',
        description: '写某个科目讲到哪一节了；at 省略就是今天',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            subject: { type: 'string', required: true, description: '科目 id' },
            section: { type: 'string', required: true, description: '章节标题，要和教材目录里的写法一致' },
            at: { type: 'string', description: ' YYYY-MM-DD，省略用今天' },
          },
        },
      },
      addExceptions: {
        type: 'array',
        description: '加例外日',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            date: { type: 'string', required: true, description: 'YYYY-MM-DD' },
            kind: { type: 'string', required: true, description: 'holiday（放假）/ swap（调课）/ exam（考试日）' },
            subject: { type: 'string', description: '只影响这个科目；省略等于整天' },
            note: { type: 'string', description: '说明，比如「调成周六上」' },
          },
        },
      },
      removeExceptions: {
        type: 'array',
        description: '删例外日；传 date 就删那天的全部，再给 kind / subject 收窄',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            date: { type: 'string', required: true, description: 'YYYY-MM-DD' },
            kind: { type: 'string', description: 'holiday / swap / exam' },
            subject: { type: 'string', description: '科目 id' },
          },
        },
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => {
      try {
        const subjects = args.subjects?.map(item => ({
          id: item.id,
          name: item.name,
          ...(item.bookId === undefined ? {} : { bookId: item.bookId }),
          ...(item.note === undefined ? {} : { note: item.note }),
        }))
        const weekly = args.weekly?.map(item => ({
          weekday: item.weekday,
          slot: item.slot,
          subject: item.subject,
          ...(item.note === undefined ? {} : { note: item.note }),
        }))
        const addLessons = args.addLessons?.map(item => ({
          weekday: item.weekday,
          slot: item.slot,
          subject: item.subject,
          ...(item.note === undefined ? {} : { note: item.note }),
        }))
        const pace = args.pace?.map(item => ({ subject: item.subject, perLesson: item.perLesson }))
        const progress = args.progress?.map(item => ({
          subject: item.subject,
          section: item.section,
          ...(item.at === undefined ? {} : { at: item.at }),
        }))
        const addExceptions = args.addExceptions?.map(item => ({
          date: item.date,
          kind: item.kind,
          ...(item.subject === undefined ? {} : { subject: item.subject }),
          ...(item.note === undefined ? {} : { note: item.note }),
        }))
        const removeExceptions = args.removeExceptions?.map(item => ({
          date: item.date,
          ...(item.kind === undefined ? {} : { kind: item.kind }),
          ...(item.subject === undefined ? {} : { subject: item.subject }),
        }))

        const touching = subjects !== undefined || args.removeSubjects !== undefined || weekly !== undefined
          || addLessons !== undefined || pace !== undefined || progress !== undefined
          || addExceptions !== undefined || removeExceptions !== undefined
        if (!touching) return '没有要更新的字段：至少给一个（subjects / weekly / addLessons / pace / progress / addExceptions…）。'

        const state = updateSchedule(file, {
          ...(subjects === undefined ? {} : { subjects }),
          ...(args.removeSubjects === undefined ? {} : { removeSubjects: args.removeSubjects }),
          ...(weekly === undefined ? {} : { weekly }),
          ...(addLessons === undefined ? {} : { addLessons }),
          ...(pace === undefined ? {} : { pace }),
          ...(progress === undefined ? {} : { progress }),
          ...(addExceptions === undefined ? {} : { addExceptions }),
          ...(removeExceptions === undefined ? {} : { removeExceptions }),
        })
        const summary = [
          '已更新（' + state.updatedAt + '）：',
          '科目 ' + String(state.subjects.length) + ' 个',
          '课表 ' + String(state.timetable.weekly.length) + ' 节/周',
          '进度 ' + String(Object.keys(state.progress).length) + ' 条',
          '例外 ' + String(state.exceptions.length) + ' 天',
          '文件：' + file,
        ]
        return summary.join('\n')
      } catch (error) {
        return explain(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'schedule_plan',
    description: [
      '给出今天该做什么，四块：下一次课讲什么、今天预习哪几页、今天复习哪些题、哪些历史遗留该处理。',
      '用在：学生问「今天干什么」、每天开头、或者你说不清该从哪科开始的时候。',
      '只读：不判题、不评价学生、不给出答案，题和页都只是锚点，问题要学生自己提。',
      '课表或进度空着也照样给下一步（复习和历史遗留不依赖课表），并直接说缺什么。',
      'minutes 是今天的题量预算，每题约 8 分钟。',
    ].join('\n'),
    parameters: {
      date: { type: 'string', description: 'YYYY-MM-DD，省略就是今天（本地日期）' },
      minutes: { type: 'integer', description: '今天有多少分钟做题，默认 25' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => {
      try {
        const today = args.date === undefined || args.date.length === 0 ? formatLocalDate() : args.date.trim()
        if (!isValidDate(today)) return 'invalid-input: date 要写成 YYYY-MM-DD，收到 ' + args.date + '。'
        const minutes = args.minutes === undefined ? 25 : args.minutes
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) {
          return 'invalid-input: minutes 要是 1–600 的整数，收到 ' + String(args.minutes) + '。'
        }

        const { state, corrupted } = loadSchedule(file)
        let bank: BankReader | undefined
        const extra: string[] = []
        try {
          const listing = listProblems(bankDirectory)
          const records = listing.records as BankProblem[]
          bank = { list: () => ({ records, skipped: listing.skipped }) }
          if (listing.skipped.length > 0) {
            extra.push('题库里有 ' + String(listing.skipped.length) + ' 个坏文件被跳过。')
          }
        } catch (error) {
          extra.push('题库读不出来（' + (error instanceof Error ? error.message : String(error)) + '），这一轮只给课表那两块。')
        }
        const reader = textbook()
        if (reader === undefined) extra.push('教材语料不可用（数据目录没找到），页数给不出来。')

        const deps: PlanDeps = {
          ...(bank === undefined ? {} : { bank }),
          ...(reader === undefined ? {} : { textbook: reader }),
          today,
          minutes,
        }
        const result = plan(state, deps)
        if (corrupted) result.notes.unshift('schedule.json 读不出来，已经当作空记录；课表和进度需要重新录一次。')
        result.notes.push(...extra)
        return renderPlan(result)
      } catch (error) {
        return explain(error)
      }
    },
  }))
}
