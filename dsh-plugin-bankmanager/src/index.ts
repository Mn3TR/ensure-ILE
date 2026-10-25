/**
 * Problem bank for ensure-ILE — the shared record every mode reads.
 *
 * One row registers five model tools over {@link ./store.ts}; the bank itself
 * lives under `<DSH_HOME>/bank/problems`, one JSON file per problem, so guide,
 * work, HRL and schedule all see the same data. The bundle patch mounts this
 * row at the profile root, which makes the tools visible to every session.
 *
 * The tool descriptions carry the usage rules because guide mode's prompt is a
 * complete section: no other prompt section survives it.
 * @module dsh-plugin-bankmanager
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-tools'
import {
  BankError,
  createProblem,
  defaultBankDirectory,
  listProblems,
  pendingHandoffs,
  readProblem,
  resumeView,
  summarizeProblem,
  summarizeStats,
  updateProblem,
  type HandoffInput,
  type HrlUpdateInput,
  type PairingChoice,
  type PairingMatch,
  type ProblemStatus,
  type WorkAttemptInput,
} from './store.ts'

/** Cordis plugin name. */
export const name = 'plugin-bankmanager'

/** Services used by this row. */
export const inject = ['tools']

/** Runtime schema for the bank row. */
export const Config = z.object({
  /** Absolute bank directory; empty means `<DSH_HOME>/bank/problems`. */
  directory: z.string().default(''),
})

/** Resolved configuration shape. */
export interface Config {
  directory?: string
}

/** Model-facing text for a store failure. */
function explain(error: unknown): string {
  if (error instanceof BankError) return error.code + ': ' + error.message
  return 'bank error: ' + (error instanceof Error ? error.message : String(error))
}

/** One-line JSON with a stable order. */
function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

/**
 * Mount the bank tools on this scope.
 * @param ctx - profile-root context; the row registers host-wide tools.
 * @param config - where the bank directory lives.
 */
export function apply(ctx: Context, config: Config): void {
  const directory = config.directory !== undefined && config.directory.length > 0
    ? config.directory
    : defaultBankDirectory()

  ctx.tools.register(defineTool({
    name: 'bank_add',
    description: [
      '把一道新题存进题库，返回题目 id。',
      '用在：学生第一次把一道题发给你、或者你判断这次要开始引导一道新题时。',
      'statement 是题干原文，尽量完整（含小问）；subject 是科目，自由写（math、arts、physics、chemistry…）；',
      'tags 可选，放知识点。',
      '同一道题只建一次：不确定建过没有，先用 bank_list 看。',
    ].join('\n'),
    parameters: {
      statement: { type: 'string', required: true, description: '题干原文' },
      subject: { type: 'string', required: true, description: '科目，自由字符串' },
      tags: { type: 'array', items: { type: 'string' }, description: '知识点标签，可省略' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => {
      try {
        const record = await createProblem(directory, {
          statement: args.statement,
          subject: args.subject,
          ...(args.tags === undefined ? {} : { tags: args.tags }),
        })
        return '已建题：' + record.id + '\n状态：new，科目：' + record.subject
      } catch (error) {
        return explain(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'bank_list',
    description: [
      '按状态列出题库里的题，每行：id、状态、科目、建立日期、题干前 40 字。',
      '用在：学生说「接着上次那道题」，或者你想知道现在手上有哪些题。',
      'status 可选：new / guide / hrl / review / mastered / parked；不传则全部。',
      '看到合适的那道题，用 bank_show 读完整记录。',
    ].join('\n'),
    parameters: {
      status: { type: 'string', description: '只看某个状态' },
      subject: { type: 'string', description: '只看某个科目' },
      limit: { type: 'integer', description: '最多返回几条，默认 20' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => {
      try {
        const { records, skipped } = listProblems(directory)
        let rows = records
        if (args.status !== undefined && args.status.length > 0) {
          rows = rows.filter(record => record.status === (args.status as ProblemStatus))
        }
        if (args.subject !== undefined && args.subject.length > 0) {
          const wanted = args.subject.toLowerCase()
          rows = rows.filter(record => record.subject.toLowerCase() === wanted)
        }
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(100, args.limit))
        const shown = rows.slice(-limit)
        const lines = shown.map(summarizeProblem)
        if (lines.length === 0) return '题库里没有符合条件的题。'
        const header = '共 ' + rows.length + ' 道，显示最近 ' + lines.length + ' 道：'
        const broken = skipped.length > 0 ? '\n跳过 ' + skipped.length + ' 个损坏文件：' + skipped.map(item => item.file).join('、') : ''
        return header + '\n' + lines.join('\n') + broken
      } catch (error) {
        return explain(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'bank_show',
    description: [
      '读一道题的完整记录（题干、引导会话、尝试、复习、历史）。',
      'id 来自 bank_add 或 bank_list。',
      '接着引导一道旧题前，先读它，别让学生重复讲一遍题干。',
    ].join('\n'),
    parameters: {
      id: { type: 'string', required: true, description: '题目 id' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => {
      try {
        return json(readProblem(directory, args.id))
      } catch (error) {
        return explain(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'bank_update',
    description: [
      '更新一道题。显式字段：status、guideOutcome（solved / stuck / abandoned）、whereStuck、guideResult、insight、reviewNextAt、reviewInterval、reviewPassed。',
      '判过（status 变 review）会自动排第一次复习；之后每复习一次用 reviewPassed 报结果：true 升一档 1/3/7/14/30/60/120 天，false 回第一档，爬到最后一档自动 mastered。',
      'affect（frustrated / neutral / excited）与 effectiveHint（confirm / position / feature / structure / result）记这一轮的学生状态和哪个档的视角有效，写进当前引导会话。',
      'workAttempt：交一次卷——answer 原文 + verdict（ok / partial / wrong）。只放学生独立做的卷；引导里做出来的写 guideResult。',
      'hrl：答案优化的增量写入，四段都可选，按 input → teacher → step → result 的顺序应用。',
      '  input 是这次在打磨哪份答案；teacher 是教师轨迹（一次写全，按学生偏好写）；',
      '  step 是一个小步的对比，写进最近一个还没有 result 的 pairing；result 是这条 pairing 拼好的最终解。',
      '  每 3 步落一次盘，pairing 结束必须写 result。',
      'handoff：交接包（from / to / why / state / detail）。同一道题最多一个未接收的，新的会顶掉旧的。',
      'handoffConsume：传会话 id 表示这份交接已被接收；传空字符串表示撤销接收，卡片重新可点。',
      'patch 是自由对象，浅合并进记录（数组整体替换），用来写工具还没覆盖的字段。',
      '每次修改都会追加 history，updatedAt 自动刷新。',
      '收尾：先问学生「这题你自己做出来了吗」。做出来 → status=review、guideOutcome=solved；',
      '没做出来 → guideOutcome=stuck，status 保持 guide，下次还能接着引导。',
    ].join('\n'),
    parameters: {
      id: { type: 'string', required: true, description: '题目 id' },
      status: { type: 'string', description: 'new / guide / hrl / review / mastered / parked' },
      guideOutcome: { type: 'string', description: 'solved / stuck / abandoned' },
      whereStuck: { type: 'string', description: '卡在哪一步（配合 guideOutcome=stuck）' },
      guideResult: { type: 'string', description: '引导结束时他自己写出来的原稿' },
      insight: { type: 'string', description: '这道题的关键转折，写给以后的自己' },
      reviewNextAt: { type: 'string', description: '下次复习时间（ISO 8601）' },
      reviewInterval: { type: 'integer', description: '复习间隔（天）' },
      reviewPassed: { type: 'boolean', description: '一次复习的结果：true 升一档（1/3/7/14/30/60/120 天），false 回第一档' },
      affect: { type: 'string', description: '这一轮学生的状态：frustrated / neutral / excited' },
      effectiveHint: { type: 'string', description: '这一轮哪个档的视角有效：confirm / position / feature / structure / result' },
      workAttempt: {
        type: 'object',
        additionalProperties: false,
        description: '记录一次独立作答',
        properties: {
          answer: { type: 'string', required: true, description: '学生原文' },
          verdict: { type: 'string', required: true, description: 'ok / partial / wrong' },
        },
      },
      hrl: {
        type: 'object',
        additionalProperties: false,
        description: '答案优化的增量写入',
        properties: {
          input: {
            type: 'object',
            additionalProperties: false,
            description: '这次打磨的是哪份答案',
            properties: {
              at: { type: 'string', description: 'ISO 时间，省略用当前时间' },
              from: { type: 'string', description: 'work（从题库带的）或 pasted（学生当场贴的）' },
              attemptAt: { type: 'string', description: '对应 work.attempts 里的 at' },
              answer: { type: 'string', required: true, description: '原文' },
            },
          },
          teacher: {
            type: 'object',
            additionalProperties: false,
            description: '教师轨迹，一次写全',
            properties: {
              writtenAt: { type: 'string', description: 'ISO 时间，省略用当前时间' },
              answer: { type: 'string', required: true, description: '教师版最终答案' },
              note: { type: 'string', description: '按什么偏好写的，可省略' },
              steps: {
                type: 'array',
                description: '按步拆开的全解',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    index: { type: 'integer', required: true },
                    body: { type: 'string', required: true, description: '这一步做什么' },
                    reason: { type: 'string', required: true, description: '为什么能这么做' },
                  },
                },
              },
            },
          },
          step: {
            type: 'object',
            additionalProperties: false,
            description: '一个小步的对比',
            properties: {
              index: { type: 'integer', required: true },
              studentQuote: { type: 'string', description: '学生原句，逐字' },
              teacherStep: { type: 'integer', description: '对应教师轨迹的 index' },
              match: { type: 'string', required: true, description: 'same / partial / missing' },
              chosen: { type: 'string', description: 'student / teacher / merged' },
              mergedText: { type: 'string', description: 'chosen=merged 时学生自己重写的这步' },
              chosenAt: { type: 'string', description: 'ISO 时间' },
              note: { type: 'string', description: '为什么这么选' },
            },
          },
          result: { type: 'string', description: '这条 pairing 逐条选完后拼出的解' },
        },
      },
      handoff: {
        type: 'object',
        additionalProperties: false,
        description: '给下一个模式的交接包',
        properties: {
          id: { type: 'string', description: '省略则自动生成' },
          from: { type: 'string', required: true, description: 'work / guide / hrl / setup' },
          to: { type: 'string', required: true, description: '目标模式' },
          why: { type: 'string', required: true, description: '一句话，为什么换' },
          state: { type: 'string', required: true, description: '这题到哪了' },
          detail: {
            type: 'object',
            additionalProperties: false,
            description: '三段散文，给下一个模式的你',
            properties: {
              lastWords: { type: 'string', description: '学生最后说了什么' },
              blocker: { type: 'string', description: '卡点' },
              nextStep: { type: 'string', description: '下一步从哪接' },
            },
          },
        },
      },
      handoffConsume: { type: 'string', description: '接受这份交接的会话 id；空字符串表示撤销接收' },
      patch: { type: 'json', description: '自由字段浅合并' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => {
      try {
        const now = new Date().toISOString()
        const workAttempt: WorkAttemptInput | undefined = args.workAttempt === undefined
          ? undefined
          : { answer: args.workAttempt.answer, verdict: args.workAttempt.verdict }
        let hrl: HrlUpdateInput | undefined
        if (args.hrl !== undefined) {
          const source = args.hrl
          hrl = {}
          if (source.input !== undefined) {
            hrl.input = {
              at: source.input.at ?? now,
              from: (source.input.from ?? 'pasted') as 'work' | 'pasted',
              answer: source.input.answer,
              ...(source.input.attemptAt === undefined ? {} : { attemptAt: source.input.attemptAt }),
            }
          }
          if (source.teacher !== undefined) {
            hrl.teacher = {
              writtenAt: source.teacher.writtenAt ?? now,
              answer: source.teacher.answer,
              steps: source.teacher.steps ?? [],
              ...(source.teacher.note === undefined ? {} : { note: source.teacher.note }),
            }
          }
          if (source.step !== undefined) {
            const step = source.step
            hrl.step = {
              index: step.index,
              match: step.match as PairingMatch,
              ...(step.studentQuote === undefined ? {} : { studentQuote: step.studentQuote }),
              ...(step.teacherStep === undefined ? {} : { teacherStep: step.teacherStep }),
              ...(step.chosen === undefined ? {} : { chosen: step.chosen as PairingChoice }),
              ...(step.mergedText === undefined ? {} : { mergedText: step.mergedText }),
              ...(step.chosenAt === undefined ? {} : { chosenAt: step.chosenAt }),
              ...(step.note === undefined ? {} : { note: step.note }),
            }
          }
          if (source.result !== undefined) hrl.result = source.result
        }
        const handoff: HandoffInput | undefined = args.handoff === undefined
          ? undefined
          : {
              from: args.handoff.from,
              to: args.handoff.to,
              why: args.handoff.why,
              state: args.handoff.state,
              ...(args.handoff.id === undefined ? {} : { id: args.handoff.id }),
              ...(args.handoff.detail === undefined ? {} : { detail: args.handoff.detail }),
            }
        const record = await updateProblem(directory, args.id, {
          ...(args.status === undefined ? {} : { status: args.status }),
          ...(args.guideOutcome === undefined ? {} : { guideOutcome: args.guideOutcome }),
          ...(args.whereStuck === undefined ? {} : { whereStuck: args.whereStuck }),
          ...(args.guideResult === undefined ? {} : { guideResult: args.guideResult }),
          ...(args.insight === undefined ? {} : { insight: args.insight }),
          ...(args.reviewNextAt === undefined ? {} : { reviewNextAt: args.reviewNextAt }),
          ...(args.reviewInterval === undefined ? {} : { reviewInterval: args.reviewInterval }),
          ...(args.reviewPassed === undefined ? {} : { reviewPassed: args.reviewPassed }),
          ...(args.affect === undefined ? {} : { affect: args.affect }),
          ...(args.effectiveHint === undefined ? {} : { effectiveHint: args.effectiveHint }),
          ...(workAttempt === undefined ? {} : { workAttempt }),
          ...(hrl === undefined ? {} : { hrl }),
          ...(handoff === undefined ? {} : { handoff }),
          ...(args.handoffConsume === undefined ? {} : { handoffConsume: args.handoffConsume }),
          ...(args.patch === undefined ? {} : { patch: args.patch as Record<string, unknown> }),
        })
        return '已更新 ' + record.id + '：状态 ' + record.status + '，历史 ' + record.history.length + ' 条。'
      } catch (error) {
        return explain(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'bank_resume',
    description: [
      '接上一道题。不给 id：列出所有待接的交接（谁留的、留给谁、为什么、这题到哪了）。',
      '给 id：直接返回那道题的题干、交接包、insight 和最后一次作答——学生说「接着上次那道题」时用这个，别让他重讲题干。',
      '新会话开场先不带 id 调一次，看不到「待接」就说明没有要接的。',
    ].join('\n'),
    parameters: {
      id: { type: 'string', description: '题目 id；省略则只列待接交接' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => {
      try {
        if (args.id === undefined || args.id.length === 0) {
          const { records } = listProblems(directory)
          const pending = pendingHandoffs(records)
          if (pending.length === 0) return '没有待接的交接。'
          return pending.map(entry => {
            const handoff = entry.handoff
            return '- ' + entry.id + '：' + handoff.from + ' -> ' + handoff.to
              + '｜' + handoff.why + '｜' + handoff.state
          }).join('\n')
        }
        return json(resumeView(readProblem(directory, args.id)))
      } catch (error) {
        return explain(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'bank_stats',
    description: [
      '题库概况：各状态计数、总数、待接交接数、最久没动的 5 道题。',
      '用在：学生问「我还有多少题没做」，或者你判断先带哪道题。',
    ].join('\n'),
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async () => {
      try {
        const { records, skipped } = listProblems(directory)
        const stats = summarizeStats(records)
        const lines = [
          '总数：' + stats.total,
          '待接交接：' + stats.pendingHandoffs,
          '按状态：' + (Object.keys(stats.byStatus).length === 0 ? '（空）' : Object.entries(stats.byStatus).map(([key, value]) => key + '=' + value).join('，')),
          '按科目：' + (Object.keys(stats.bySubject).length === 0 ? '（空）' : Object.entries(stats.bySubject).map(([key, value]) => key + '=' + value).join('，')),
          '最久没动：',
          ...(stats.stalest.length === 0 ? ['（空）'] : stats.stalest.map(item => '- ' + item.id + ' ' + item.status + ' ' + item.updatedAt.slice(0, 10))),
        ]
        if (skipped.length > 0) lines.push('损坏文件：' + skipped.length + ' 个')
        return lines.join('\n')
      } catch (error) {
        return explain(error)
      }
    },
  }))
}
