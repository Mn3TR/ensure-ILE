/**
 * Textbook anchor for ensure-ILE — three read-only hands over the committed corpus.
 *
 * Every mode's prompt is a `complete` section, so no prompt section survives it:
 * the rules have to live in the tool descriptions, exactly as the bank does it.
 * These three tools answer one question — "what does the book actually say on
 * page N" — because a model that cannot look it up will happily invent a 定理.
 *
 * Nothing here writes: the corpus is built at development time by
 * `scripts/extract.py` and shipped in `data/`. At runtime there is no PDF and no
 * Python, so a broken corpus degrades to one sentence, never to a crash.
 * @module dsh-plugin-textbook
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-tools'
import {
  createBookStore,
  defaultDataDirectory,
  italicLetterNote,
  type Book,
  type BookStore,
  type BookSummary,
  type SectionEntry,
} from './data.ts'

/** Cordis plugin name. */
export const name = 'plugin-textbook'

/** Only the tool registry is required; this row has no browser half and no host service. */
export const inject = ['tools']

/** Runtime schema for the textbook row. */
export const Config = z.object({
  /** Absolute corpus directory; empty means the package's own `data/`. */
  dataDirectory: z.string().default(''),
})

/** Resolved configuration shape. */
export interface Config {
  dataDirectory?: string
}

/**
 * Where the corpus is: explicit config first, then the DSH_TEXTBOOK_DATA
 * override, then the committed data/ directory next to lib/data.js.
 *
 * The default is resolved from this module's own URL, never from process.cwd():
 * the desktop app starts in whatever directory the student's shortcut names,
 * and a corpus that depends on that is a corpus that disappears.
 * @param config - row configuration.
 * @returns absolute corpus directory.
 */
function resolveDataDirectory(config: Config): string {
  if (config.dataDirectory !== undefined && config.dataDirectory.length > 0) return config.dataDirectory
  const fromEnv = process.env['DSH_TEXTBOOK_DATA']
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv
  return defaultDataDirectory()
}

/** Model-facing text for a store failure. */
function explain(error: unknown): string {
  return 'textbook error: ' + (error instanceof Error ? error.message : String(error))
}

/** Last page of a half-open section range, never below its first page. */
function sectionRange(section: SectionEntry): [number, number] {
  return [section.pdfPage, Math.max(section.pdfPage, section.endPage - 1)]
}

/** Textbook page for a PDF page; the corpus says 课本页 = PDF 页 - offset. */
function textbookPage(summary: BookSummary | undefined, pdfPage: number): number | undefined {
  if (summary === undefined) return undefined
  return pdfPage - summary.textbookOffset
}

/**
 * Mount the three textbook tools on this scope.
 * @param ctx - profile-root context; the row registers host-wide tools.
 * @param config - where the corpus lives.
 */
export function apply(ctx: Context, config: Config): void {
  const store: BookStore = createBookStore({ dataDirectory: resolveDataDirectory(config) })

  ctx.tools.register(defineTool({
    name: 'textbook_books',
    description: [
      '列出教材库里每一本书：id、书名、科目、页数、有没有文字层、目录里有多少节。',
      '用在：学生提到某本教材（「必修一」「物理必修二」）时，或者你自己准备读教材之前——先看一眼有哪些书，别猜 id。',
      '这一只只读目录：标了「扫描件」的那册没有正文可读，读不出文字，只能把页码告诉学生。',
    ].join('\n'),
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async () => {
      try {
        const books = store.listBooks()
        if (books.length === 0) return '教材库里一本书都没有：语料没生成，或者 dataDirectory 指错了。'
        return books.map(book => [
          book.id,
          book.title,
          book.subject,
          book.pages + ' 页',
          book.textAvailable ? '有文字层' : '扫描件（只有目录和页码）',
          book.sectionCount + ' 节',
        ].join('｜')).join('\n')
      } catch (error) {
        return explain(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'textbook_find',
    description: [
      '按关键词在教材目录里找节，每行：bookId、书名、节名、PDF 页码范围（含课本页码）、层级。',
      '用在：学生说「老师今天讲到哪」「第 6.1 节」、或者你要引某一段原文时——先 find 拿到 bookId 和页码，再用 textbook_read 读正文。',
      'query 写节号（6.1）、节名片段（平面向量的应用）或关键词（向量）；它只匹配节标题、不扫正文，搜定理名搜不到就先想它属于哪一节。',
      'book 可选，用来限定一册（id 或书名片段）；limit 默认 20。',
      '这一只只看目录、不读正文；找不到时会告诉你已知有哪些书。',
    ].join('\n'),
    parameters: {
      query: { type: 'string', required: true, description: '节号、节名片段或关键词' },
      book: { type: 'string', description: '限定某一册：id 或书名片段，可省略' },
      limit: { type: 'integer', description: '最多返回几行，默认 20' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => {
      try {
        const hits = store.findSections(args.query, {
          ...(args.book === undefined || args.book.length === 0 ? {} : { book: args.book }),
          ...(args.limit === undefined ? {} : { limit: args.limit }),
        })
        if (hits.length === 0) {
          const books = store.listBooks().map(book => book.id + '（' + book.title + '）').join('、')
          return '目录里没找到「' + args.query + '」。已知的教材：' + (books.length > 0 ? books : '（一本都没有）')
        }
        const known = new Map(store.listBooks().map(book => [book.id, book]))
        const lines = hits.map(hit => {
          const [start, end] = sectionRange(hit.section)
          const summary = known.get(hit.bookId)
          const first = textbookPage(summary, start)
          const last = textbookPage(summary, end)
          const where = first === undefined || last === undefined ? '' : '（课本 p' + first + '-' + last + '）'
          return [
            hit.bookId,
            hit.bookTitle,
            hit.section.title,
            'PDF p' + start + '-' + end + where,
            hit.section.level === 1 ? '章' : '节',
          ].join('｜')
        })
        return '共 ' + hits.length + ' 节：' + '\n' + lines.join('\n')
      } catch (error) {
        return explain(error)
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'textbook_read',
    description: [
      '按 PDF 页码读教材正文，返回带 [p12] 页码标记的原文。',
      '用在：学生问课本上某段怎么讲、你要引教材原文、要对着老师讲的进度说话时——先用 textbook_find 定位，再来这里读。',
      'from 是 PDF 页（1 基，取 find 返回的页码范围），to 可选；也可以只给 section（节名，唯一命中才读）。',
      '一次大约 6000 字，末尾会告诉你下一页从哪接着读。',
      '读到什么就是什么：缺的、跳过的页码不要自己补，也不要改写原文。扫描件读不出文字，只能把页码给学生让他翻书。',
    ].join('\n'),
    parameters: {
      book: { type: 'string', required: true, description: '教材 id（从 textbook_books / textbook_find 拿）' },
      from: { type: 'integer', required: true, description: '起始 PDF 页，1 基' },
      to: { type: 'integer', description: '结束 PDF 页（含），可省略' },
      section: { type: 'string', description: '节名；给了就按节定位，from 被忽略' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => {
      try {
        let book: Book
        try {
          book = store.readBook(args.book)
        } catch (error) {
          return explain(error)
        }

        const wantedSection = args.section === undefined ? '' : args.section.trim()
        let section: SectionEntry | undefined
        let from = args.from
        let to = args.to

        if (wantedSection.length > 0) {
          const hits = store.findSections(wantedSection, { book: book.id, limit: 8 })
          if (hits.length === 0) {
            return '《' + book.title + '》的目录里没有「' + wantedSection + '」。用 textbook_find 查一下节名，或者直接给 from 页码。'
          }
          const first = hits[0]
          if (first === undefined) return '《' + book.title + '》的目录里没有「' + wantedSection + '」。'
          if (hits.length > 1) {
            const list = hits.map(hit => {
              const [start, end] = sectionRange(hit.section)
              return hit.section.title + '（PDF p' + start + '-' + end + '）'
            }).join('、')
            return '「' + wantedSection + '」在这一册里对得上 ' + hits.length + ' 节：' + list + '。把 section 写全一点，或者直接给 from 页码。'
          }
          section = first.section
          const [start, end] = sectionRange(section)
          from = start
          to = end
        }

        const range = store.readPages(book.id, from, to)
        if (!range.hasText) {
          const label = section === undefined ? '' : '，PDF p' + range.firstPage + '-' + range.lastPage + ' 是 ' + section.title
          return '这一册只有目录和页码，没有文字层：' + book.title + label + '——把页码告诉学生，让他翻书'
        }

        const first = textbookPage(book, range.firstPage)
        const last = textbookPage(book, range.lastPage)
        const where = first === undefined || last === undefined ? '' : '（课本 p' + first + '-' + last + '）'
        const head = '《' + book.title + '》' + (section === undefined ? '' : ' ' + section.title) + ' PDF p' + range.firstPage + '-' + range.lastPage + where
        const note = italicLetterNote(range.text)
        const parts = note === undefined ? [head, range.text] : [head, note, range.text]
        if (range.nextPage !== undefined) {
          const upper = to === undefined ? Math.max(book.pages, book.pagesText.length) : to
          const remaining = Math.max(upper - range.nextPage + 1, 1)
          parts.push('…还有 ' + remaining + ' 页，用 from=' + range.nextPage + ' 接着读')
        }
        return parts.join('\n')
      } catch (error) {
        return explain(error)
      }
    },
  }))
}
