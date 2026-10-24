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
  readProblem,
  summarizeProblem,
  summarizeStats,
  updateProblem,
  type ProblemStatus,
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
      '更新一道题。显式字段：status、guideOutcome（solved / stuck / abandoned）、whereStuck、insight、reviewNextAt、reviewInterval、attempt。',
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
      insight: { type: 'string', description: '这道题的关键转折，写给以后的自己' },
      reviewNextAt: { type: 'string', description: '下次复习时间（ISO 8601）' },
      reviewInterval: { type: 'integer', description: '复习间隔（天）' },
      attempt: {
        type: 'object',
        additionalProperties: false,
        description: '记录一次作答',
        properties: {
          mode: { type: 'string', required: true, description: 'work / hrl / guide' },
          answer: { type: 'string', required: true, description: '学生的答案' },
          verdict: { type: 'string', required: true, description: 'ok / partial / wrong' },
        },
      },
      patch: { type: 'json', description: '自由字段浅合并' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => {
      try {
        const record = await updateProblem(directory, args.id, {
          ...(args.status === undefined ? {} : { status: args.status }),
          ...(args.guideOutcome === undefined ? {} : { guideOutcome: args.guideOutcome }),
          ...(args.whereStuck === undefined ? {} : { whereStuck: args.whereStuck }),
          ...(args.insight === undefined ? {} : { insight: args.insight }),
          ...(args.reviewNextAt === undefined ? {} : { reviewNextAt: args.reviewNextAt }),
          ...(args.reviewInterval === undefined ? {} : { reviewInterval: args.reviewInterval }),
          ...(args.attempt === undefined ? {} : { attempt: args.attempt }),
          ...(args.patch === undefined ? {} : { patch: args.patch as Record<string, unknown> }),
        })
        return '已更新 ' + record.id + '：状态 ' + record.status + '，历史 ' + record.history.length + ' 条。'
      } catch (error) {
        return explain(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'bank_stats',
    description: [
      '题库概况：各状态计数、总数、最久没动的 5 道题。',
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
