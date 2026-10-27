/**
 * Textbook corpus reader: JSON built at development time by `scripts/extract.py`.
 *
 * The shipped app carries no Python and never touches a PDF; every page of every
 * book was extracted once on the development machine and committed under
 * `data/`. This module is the only consumer of that shape: pure logic, no
 * cordis, no sibling package, so tests (and the schedule preset) can import it
 * without booting a host.
 *
 * The corpus shape, per book:
 * `{ id, title, subject, publisher, pages, textbookOffset, textAvailable,`
 * `  sections: [{ level: 1|2, title, pdfPage, endPage }], pagesText: (string|null)[] }`
 *
 * `pagesText` is 0-based (`pagesText[i]` is PDF page `i + 1`) and `null`
 * means "this page has no text layer" — one book (人教A数学必修一) is a pure scan.
 * Page ranges are half-open: `pdfPage` to `endPage` is the section body.
 * @module dsh-plugin-textbook/data
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** What `index.json` says about one book, without its text. */
export interface BookSummary {
  id: string
  title: string
  subject: string
  publisher: string
  pages: number
  /** Textbook page = PDF page - textbookOffset. */
  textbookOffset: number
  /** False for a pure scan: the目录 exists, the body does not. */
  textAvailable: boolean
  sectionCount: number
}

/** One目录 entry. `endPage` is exclusive. */
export interface SectionEntry {
  level: 1 | 2
  title: string
  pdfPage: number
  endPage: number
}

/** One book with its目录 and page texts. */
export interface Book extends BookSummary {
  sections: SectionEntry[]
  pagesText: (string | null)[]
}

/** One hit from {@link BookStore.findSections}. */
export interface SectionHit {
  bookId: string
  bookTitle: string
  subject: string
  section: SectionEntry
}

/** One page range read back as text. */
export interface PageRange {
  text: string
  /** 1-based PDF page, after clamping. */
  firstPage: number
  /** 1-based PDF page, the last page actually handed back. */
  lastPage: number
  /** Set only when the range was cut short: where to continue. */
  nextPage?: number
  /** False when every page in the range has no text layer. */
  hasText: boolean
}

/** Options for {@link BookStore.findSections}. */
export interface FindOptions {
  /** Book id, or a fragment of the id / title / subject. */
  book?: string
  /** Maximum hits; defaults to {@link DEFAULT_FIND_LIMIT}. */
  limit?: number
}

/** The reader the plugin row and the tests share. */
export interface BookStore {
  listBooks(): BookSummary[]
  readBook(id: string): Book
  findSections(query: string, opts?: FindOptions): SectionHit[]
  nextSection(bookId: string, afterTitle: string): SectionEntry | undefined
  readPages(bookId: string, from: number, to?: number, maxChars?: number): PageRange
}

/** How many characters one {@link BookStore.readPages} call returns by default. */
export const DEFAULT_MAX_CHARS = 6000

/** How many目录 hits {@link BookStore.findSections} returns by default. */
export const DEFAULT_FIND_LIMIT = 20

/**
 * 人教A版数学把斜体字母抽成了 U+7280–U+72FF 的生僻字（犃=A、犅=B、犪=a、狓=x）。
 * 映射不规整（大写从 0x7243 起、小写断档），所以**不改写**正文，只给模型一句读法。
 */
const GARBLED_LETTERS = /[\u7280-\u72FF]/gu

/**
 * One sentence to put in front of a page whose italic letters came out as rare
 * 汉字, or undefined when the page reads normally.
 * @param body - page text as handed to the model.
 */
export function italicLetterNote(body: string): string | undefined {
  const hits = body.match(GARBLED_LETTERS)
  if (hits === null || hits.length < 3) return undefined
  return '（这一页里的 犃 犅 犆… 犪 犫 犮… 狓 狔 狕 不是错字：PDF 把斜体字母抽成了生僻字，'
    + '犃=A、犪=a、狓=x 依次类推，按这个规律读。这个区间里偶尔也有真汉字（状、独、猜），照常理解。）'
}

/** Ids address a file name inside `data/books`, so they may not walk out of it. */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * Where the committed corpus lives, resolved next to this module: `<pkg>/data/`.
 * @returns absolute directory, with a trailing separator.
 */
export function defaultDataDirectory(): string {
  return fileURLToPath(new URL('../data/', import.meta.url))
}

function fail(message: string): never {
  throw new Error(message)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function count(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
}

function clampPage(page: number, pages: number): number {
  const whole = Number.isFinite(page) ? Math.trunc(page) : 1
  return Math.min(Math.max(whole, 1), Math.max(pages, 1))
}

function readJson(file: string, what: string): unknown {
  if (!existsSync(file)) {
    fail(what + ' not found: ' + file + '（语料还没生成？看 README 的「重生成语料」）')
  }
  const raw = readFileSync(file, 'utf8')
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    fail(what + ' is not valid JSON: ' + file + '（' + reason + '）')
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

/**
 * Match one section title against a query: a plain case-insensitive substring,
 * or — for multi-word queries — every whitespace/comma separated token present.
 * Chinese has no spaces, so the substring branch carries both 节号 (`6.1`) and
 * fragments (`正弦定理`); the token branch only helps mixed input like
 * `"必修二 6.1"`. Deliberately dumb: a miss costs one more query, a clever
 * fuzzy match costs a wrong citation.
 * @param title - section title from the corpus.
 * @param query - what the model typed.
 * @returns whether the title answers the query.
 */
function matchesTitle(title: string, query: string): boolean {
  const haystack = title.toLowerCase()
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return false
  if (haystack.includes(needle)) return true
  const tokens = needle.split(/[\s,，、;；/]+/u).filter(token => token.length > 0)
  return tokens.length > 1 && tokens.every(token => haystack.includes(token))
}

function normalizeSection(raw: unknown): SectionEntry | undefined {
  const source = asRecord(raw)
  const title = text(source.title).trim()
  if (title.length === 0) return undefined
  const pdfPage = Math.max(count(source.pdfPage, 1), 1)
  const endPage = Math.max(count(source.endPage, pdfPage), pdfPage)
  const level: 1 | 2 = source.level === 1 ? 1 : 2
  return { level, title, pdfPage, endPage }
}

function normalizeSummary(raw: unknown): BookSummary | undefined {
  const source = asRecord(raw)
  const id = text(source.id).trim()
  if (id.length === 0 || !ID_PATTERN.test(id)) return undefined
  return {
    id,
    title: text(source.title).trim() || id,
    subject: text(source.subject).trim(),
    publisher: text(source.publisher).trim(),
    pages: Math.max(count(source.pages, 0), 0),
    textbookOffset: count(source.textbookOffset, 0),
    textAvailable: source.textAvailable === true,
    sectionCount: Math.max(count(source.sectionCount, 0), 0),
  }
}

/**
 * Build a reader over one corpus directory.
 *
 * Everything is lazy and cached per book: reading the index is one small parse,
 * reading a book is one parse per id for the life of the store. Grading a paper
 * touches the same book a dozen times and must not re-parse 500 kB each time.
 * A missing or broken corpus throws — the tool layer turns that into one
 * sentence for the model instead of a stack trace.
 *
 * @param options - `dataDirectory` overrides {@link defaultDataDirectory}.
 * @returns the reader.
 */
export function createBookStore(options: { dataDirectory?: string } = {}): BookStore {
  const directory = options.dataDirectory !== undefined && options.dataDirectory.length > 0
    ? options.dataDirectory
    : defaultDataDirectory()
  let summaries: BookSummary[] | undefined
  const books = new Map<string, Book>()

  function knownIds(known: readonly BookSummary[]): string {
    return known.length === 0 ? '（一本都没有）' : known.map(book => book.id).join('、')
  }

  function loadIndex(): BookSummary[] {
    if (summaries !== undefined) return summaries
    const raw = asRecord(readJson(join(directory, 'index.json'), '教材索引 index.json'))
    const rows = Array.isArray(raw.books) ? raw.books : []
    const parsed: BookSummary[] = []
    for (const row of rows) {
      const summary = normalizeSummary(row)
      if (summary !== undefined) parsed.push(summary)
    }
    summaries = parsed
    return parsed
  }

  function readBook(id: string): Book {
    const known = loadIndex()
    const summary = known.find(book => book.id === id)
    if (summary === undefined) {
      fail('没有 ' + JSON.stringify(id) + ' 这本教材。已知的有：' + knownIds(known))
    }
    const cached = books.get(summary.id)
    if (cached !== undefined) return cached

    const raw = asRecord(readJson(join(directory, 'books', summary.id + '.json'), '教材 ' + summary.id))
    const sections: SectionEntry[] = []
    for (const row of Array.isArray(raw.sections) ? raw.sections : []) {
      const section = normalizeSection(row)
      if (section !== undefined) sections.push(section)
    }
    const pagesText: (string | null)[] = (Array.isArray(raw.pagesText) ? raw.pagesText : [])
      .map(page => (typeof page === 'string' ? page : null))
    const book: Book = {
      ...summary,
      title: text(raw.title).trim() || summary.title,
      sectionCount: sections.length > 0 ? sections.length : summary.sectionCount,
      sections,
      pagesText,
    }
    books.set(summary.id, book)
    return book
  }

  function booksMatching(selector: string): BookSummary[] {
    const known = loadIndex()
    const key = selector.trim()
    const lower = key.toLowerCase()
    const exact = known.filter(book => book.id === key || book.id.toLowerCase() === lower)
    if (exact.length > 0) return exact
    const fuzzy = known.filter(book =>
      book.id.toLowerCase().includes(lower)
      || book.title.toLowerCase().includes(lower)
      || book.subject.toLowerCase() === lower)
    if (fuzzy.length === 0) {
      fail('在已知教材里找不到 ' + JSON.stringify(selector) + '。已知的有：' + knownIds(known))
    }
    return fuzzy
  }

  function findSections(query: string, opts: FindOptions = {}): SectionHit[] {
    const asked = query.trim()
    if (asked.length === 0) return []
    const wantedLimit = opts.limit === undefined || !Number.isFinite(opts.limit) ? DEFAULT_FIND_LIMIT : Math.trunc(opts.limit)
    const limit = Math.max(1, Math.min(wantedLimit, 100))
    const wanted = opts.book === undefined || opts.book.trim().length === 0
      ? loadIndex()
      : booksMatching(opts.book)

    const hits: SectionHit[] = []
    for (const summary of wanted) {
      for (const section of readBook(summary.id).sections) {
        if (!matchesTitle(section.title, asked)) continue
        hits.push({ bookId: summary.id, bookTitle: summary.title, subject: summary.subject, section })
        if (hits.length >= limit) return hits
      }
    }
    return hits
  }

  function nextSection(bookId: string, afterTitle: string): SectionEntry | undefined {
    const sections = readBook(bookId).sections
    const asked = afterTitle.trim()
    if (asked.length === 0) return undefined
    let index = sections.findIndex(section => section.title === asked)
    if (index < 0) index = sections.findIndex(section => matchesTitle(section.title, asked))
    if (index < 0) return undefined
    return sections[index + 1]
  }

  function readPages(bookId: string, from: number, to?: number, maxChars: number = DEFAULT_MAX_CHARS): PageRange {
    const book = readBook(bookId)
    const pages = Math.max(book.pages, book.pagesText.length, 1)
    const upper = to === undefined ? pages : clampPage(to, pages)
    const start = Math.min(clampPage(from, pages), upper)

    const budget = Number.isFinite(maxChars) ? Math.max(Math.trunc(maxChars), 1) : DEFAULT_MAX_CHARS
    const chunks: string[] = []
    let length = 0
    let lastPage = start
    let nextPage: number | undefined
    let hasText = false
    let started = false

    for (let page = start; page <= upper; page += 1) {
      const body = book.pagesText[page - 1] ?? null
      if (body === null) {
        // 扫描页：页仍算读过（页码要报给学生），但一个字也不编。
        started = true
        lastPage = page
        continue
      }
      const chunk = '[p' + page + '] ' + body
      const cost = chunk.length + (chunks.length > 0 ? 1 : 0)
      // 一页独占就超预算时整页放进来了：宁可超一点，也不能返回空。
      if (started && length + cost > budget) {
        nextPage = page
        break
      }
      started = true
      lastPage = page
      chunks.push(chunk)
      length += cost
      hasText = true
    }

    return {
      text: chunks.join('\n'),
      firstPage: start,
      lastPage,
      hasText,
      ...(nextPage === undefined ? {} : { nextPage }),
    }
  }

  return { listBooks: loadIndex, readBook, findSections, nextSection, readPages }
}
