import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createBookStore, italicLetterNote, type BookStore } from '../src/data.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/', import.meta.url))

function store(): BookStore {
  return createBookStore({ dataDirectory: FIXTURE })
}

describe('listBooks', () => {
  it('reads the index without touching any book file', () => {
    const books = store().listBooks()
    expect(books.map(book => book.id)).toEqual(['fx-text', 'fx-scan'])
    const text = books[0]
    expect(text?.title).toBe('测试·有文字层')
    expect(text?.pages).toBe(12)
    expect(text?.textbookOffset).toBe(3)
    expect(text?.sectionCount).toBe(5)
    expect(books[1]?.textAvailable).toBe(false)
  })
})

describe('readBook', () => {
  it('reads sections and pages, and folds the summary in', () => {
    const book = store().readBook('fx-text')
    expect(book.title).toBe('测试·有文字层')
    expect(book.sections).toHaveLength(5)
    expect(book.sections[1]).toEqual({ level: 2, title: '1.1 集合的概念', pdfPage: 4, endPage: 6 })
    expect(book.pagesText).toHaveLength(12)
    expect(book.pagesText[3]).toContain('集合')
    expect(book.pagesText[4]).toBeNull()
  })

  it('caches one parse per book', () => {
    const reader = store()
    expect(reader.readBook('fx-text')).toBe(reader.readBook('fx-text'))
  })

  it('names the books it does know when the id is wrong', () => {
    const reader = store()
    expect(() => reader.readBook('nope-1')).toThrow(/nope-1/u)
    expect(() => reader.readBook('nope-1')).toThrow(/fx-text/u)
    expect(() => reader.readBook('nope-1')).toThrow(/fx-scan/u)
  })

  it('refuses to walk out of the corpus directory', () => {
    expect(() => store().readBook('../../etc/passwd')).toThrow(/已知的有/u)
  })
})

describe('findSections', () => {
  it('matches a section title substring', () => {
    const hits = store().findSections('集合的概念')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.bookId).toBe('fx-text')
    expect(hits[0]?.bookTitle).toBe('测试·有文字层')
    expect(hits[0]?.section.title).toBe('1.1 集合的概念')
  })

  it('matches a section number and finds several hits', () => {
    const hits = store().findSections('集合')
    expect(hits.map(hit => hit.section.title)).toEqual([
      '第一章 集合与逻辑',
      '1.1 集合的概念',
      '1.2 集合间的关系',
    ])
    expect(store().findSections('1.2')[0]?.section.title).toBe('1.2 集合间的关系')
  })

  it('honours limit', () => {
    expect(store().findSections('集合', { limit: 2 })).toHaveLength(2)
  })

  it('limits to one book by id, title fragment or subject', () => {
    expect(store().findSections('集合', { book: 'fx-text' })).toHaveLength(3)
    expect(store().findSections('集合', { book: 'fx-scan' })).toEqual([])
    expect(store().findSections('运动', { book: '扫描件' })).toHaveLength(1)
    expect(store().findSections('质点', { book: 'physics' })[0]?.bookId).toBe('fx-scan')
  })

  it('says which books exist when the book filter matches nothing', () => {
    expect(() => store().findSections('集合', { book: 'renjiao' })).toThrow(/fx-text、fx-scan/u)
  })

  it('returns nothing for an empty or unknown query', () => {
    expect(store().findSections('   ')).toEqual([])
    expect(store().findSections('正弦定理')).toEqual([])
  })
})

describe('readPages', () => {
  it('reads a closed range with page markers', () => {
    const range = store().readPages('fx-text', 4, 6)
    expect(range.firstPage).toBe(4)
    expect(range.lastPage).toBe(6)
    expect(range.hasText).toBe(true)
    expect(range.nextPage).toBeUndefined()
    expect(range.text).toContain('[p4] 1.1 集合的概念')
    expect(range.text).toContain('[p6] 1.2 集合间的关系')
    expect(range.text).not.toContain('[p7]')
  })

  it('skips a page with no text layer inside the range', () => {
    const range = store().readPages('fx-text', 4, 6)
    expect(range.text).not.toContain('[p5]')
    expect(range.hasText).toBe(true)
  })

  it('reports no text when every page in the range is a scan', () => {
    const scanned = store().readPages('fx-scan', 1, 6)
    expect(scanned.hasText).toBe(false)
    expect(scanned.text).toBe('')
    expect(scanned.firstPage).toBe(1)
    expect(scanned.lastPage).toBe(6)
    expect(scanned.nextPage).toBeUndefined()
    expect(store().readPages('fx-text', 5, 5).hasText).toBe(false)
  })

  it('clamps both ends to the book', () => {
    const low = store().readPages('fx-text', -5, 2)
    expect(low.firstPage).toBe(1)
    expect(low.lastPage).toBe(2)
    const high = store().readPages('fx-text', 500)
    expect(high.firstPage).toBe(12)
    expect(high.lastPage).toBe(12)
    // 上界 999 夹到 12 页；预算给足才读得到最后一页。
    expect(store().readPages('fx-text', 1, 999, 1_000_000).lastPage).toBe(12)
    expect(store().readPages('fx-text', 1, 999).nextPage).toBeDefined()
  })

  it('cuts at maxChars and says where to continue', () => {
    const range = store().readPages('fx-text', 1, 12, 120)
    expect(range.hasText).toBe(true)
    expect(range.lastPage).toBeLessThan(12)
    expect(range.nextPage).toBe(range.lastPage + 1)

    let page: number | undefined = range.nextPage
    let last = range.lastPage
    let reads = 1
    while (page !== undefined && reads < 50) {
      const next = store().readPages('fx-text', page, 12, 120)
      expect(next.firstPage).toBe(page)
      last = next.lastPage
      page = next.nextPage
      reads += 1
    }
    expect(last).toBe(12)
    expect(reads).toBeLessThan(50)
  })

  it('keeps one page whole rather than returning nothing', () => {
    const range = store().readPages('fx-text', 9, 12, 10)
    expect(range.hasText).toBe(true)
    expect(range.text.length).toBeGreaterThan(10)
    expect(range.lastPage).toBe(9)
    expect(range.nextPage).toBe(10)
  })

  it('fails loudly on an unknown book', () => {
    expect(() => store().readPages('nope-1', 1)).toThrow(/已知的有/u)
  })
})

describe('nextSection', () => {
  it('walks to the next entry in document order', () => {
    expect(store().nextSection('fx-text', '1.1 集合的概念')?.title).toBe('1.2 集合间的关系')
    expect(store().nextSection('fx-text', '第一章 集合与逻辑')?.title).toBe('1.1 集合的概念')
  })

  it('accepts a fragment of the title', () => {
    expect(store().nextSection('fx-text', '1.1')?.title).toBe('1.2 集合间的关系')
  })

  it('returns undefined after the last section or for an unknown title', () => {
    expect(store().nextSection('fx-text', '2.1 函数的概念')).toBeUndefined()
    expect(store().nextSection('fx-text', '不存在的节')).toBeUndefined()
    expect(store().nextSection('fx-text', '')).toBeUndefined()
  })
})

describe('broken corpus', () => {
  it('explains a missing index instead of throwing a bare ENOENT', () => {
    const empty = createBookStore({ dataDirectory: FIXTURE + 'nowhere/' })
    expect(() => empty.listBooks()).toThrow(/index\.json/u)
    expect(() => empty.listBooks()).toThrow(/not found/u)
  })
})

describe('italicLetterNote', () => {
  it('人教A版数学那类斜体乱码给一句读法，正常页什么也不加', () => {
    expect(italicLetterNote('向量 犃犅 的长度记作 ｜犃犅｜，犪 是实数')).toContain('斜体字母')
    expect(italicLetterNote('普通正文：集合与元素的关系')).toBeUndefined()
    expect(italicLetterNote('状 独')).toBeUndefined()
  })
})
