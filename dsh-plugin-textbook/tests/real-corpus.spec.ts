import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createBookStore } from '../src/data.ts'

// 真实语料 1.8MB：只跑冒烟，细节用 tests/fixtures 里那两本小书。
const CORPUS = fileURLToPath(new URL('../data/', import.meta.url))
const present = existsSync(join(CORPUS, 'index.json'))

describe.skipIf(!present)('real corpus', () => {
  it('loads the seven必修 books', () => {
    const books = createBookStore({ dataDirectory: CORPUS }).listBooks()
    expect(books).toHaveLength(7)
    expect(books.map(book => book.id).sort()).toEqual([
      'jiaoke-phys-1',
      'jiaoke-phys-2',
      'jiaoke-phys-3',
      'renjiao-chem-1',
      'renjiao-chem-2',
      'renjiaoA-math-1',
      'renjiaoA-math-2',
    ])
    const scanned = books.find(book => book.id === 'renjiaoA-math-1')
    expect(scanned?.textAvailable).toBe(false)
    expect(books.filter(book => book.textAvailable)).toHaveLength(6)
  })

  it('reads a page from a book that has a text layer', () => {
    const reader = createBookStore({ dataDirectory: CORPUS })
    const book = reader.readBook('renjiaoA-math-2')
    expect(book.sections.length).toBeGreaterThan(0)
    expect(book.pagesText).toHaveLength(book.pages)
    const range = reader.readPages('renjiaoA-math-2', 8, 9)
    expect(range.hasText).toBe(true)
    expect(range.text).toContain('[p8]')
  })

  it('knows the scan has no text on its pages', () => {
    const range = createBookStore({ dataDirectory: CORPUS }).readPages('renjiaoA-math-1', 20, 24)
    expect(range.hasText).toBe(false)
    expect(range.text).toBe('')
  })
})
