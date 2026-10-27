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
/** What `index.json` says about one book, without its text. */
export interface BookSummary {
    id: string;
    title: string;
    subject: string;
    publisher: string;
    pages: number;
    /** Textbook page = PDF page - textbookOffset. */
    textbookOffset: number;
    /** False for a pure scan: the目录 exists, the body does not. */
    textAvailable: boolean;
    sectionCount: number;
}
/** One目录 entry. `endPage` is exclusive. */
export interface SectionEntry {
    level: 1 | 2;
    title: string;
    pdfPage: number;
    endPage: number;
}
/** One book with its目录 and page texts. */
export interface Book extends BookSummary {
    sections: SectionEntry[];
    pagesText: (string | null)[];
}
/** One hit from {@link BookStore.findSections}. */
export interface SectionHit {
    bookId: string;
    bookTitle: string;
    subject: string;
    section: SectionEntry;
}
/** One page range read back as text. */
export interface PageRange {
    text: string;
    /** 1-based PDF page, after clamping. */
    firstPage: number;
    /** 1-based PDF page, the last page actually handed back. */
    lastPage: number;
    /** Set only when the range was cut short: where to continue. */
    nextPage?: number;
    /** False when every page in the range has no text layer. */
    hasText: boolean;
}
/** Options for {@link BookStore.findSections}. */
export interface FindOptions {
    /** Book id, or a fragment of the id / title / subject. */
    book?: string;
    /** Maximum hits; defaults to {@link DEFAULT_FIND_LIMIT}. */
    limit?: number;
}
/** The reader the plugin row and the tests share. */
export interface BookStore {
    listBooks(): BookSummary[];
    readBook(id: string): Book;
    findSections(query: string, opts?: FindOptions): SectionHit[];
    nextSection(bookId: string, afterTitle: string): SectionEntry | undefined;
    readPages(bookId: string, from: number, to?: number, maxChars?: number): PageRange;
}
/** How many characters one {@link BookStore.readPages} call returns by default. */
export declare const DEFAULT_MAX_CHARS = 6000;
/** How many目录 hits {@link BookStore.findSections} returns by default. */
export declare const DEFAULT_FIND_LIMIT = 20;
/**
 * One sentence to put in front of a page whose italic letters came out as rare
 * 汉字, or undefined when the page reads normally.
 * @param body - page text as handed to the model.
 */
export declare function italicLetterNote(body: string): string | undefined;
/**
 * Where the committed corpus lives, resolved next to this module: `<pkg>/data/`.
 * @returns absolute directory, with a trailing separator.
 */
export declare function defaultDataDirectory(): string;
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
export declare function createBookStore(options?: {
    dataDirectory?: string;
}): BookStore;
