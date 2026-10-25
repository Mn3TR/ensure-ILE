/**
 * Shared teaching text for every ensure-ILE mode.
 *
 * Each mode replaces the whole system prompt (a `complete` section), so the
 * parts every mode keeps — how to talk, safety, bank usage — live here once and
 * get composed at mount time. Subject notes are read by the `read_note` tool.
 * @module dsh-plugin-teaching-commons
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The shared prompt fragments a mode may compose. */
export const SHARED_PARTS = ['common', 'bank'] as const
export type SharedPart = (typeof SHARED_PARTS)[number]

const PROMPTS_DIR = fileURLToPath(new URL('../prompts/', import.meta.url))
const NOTES_DIR = fileURLToPath(new URL('../skills/', import.meta.url))

/**
 * Read one shared prompt fragment.
 * @param part - fragment name.
 * @returns the fragment text, without a trailing newline.
 */
export function sharedPrompt(part: SharedPart): string {
  const file = join(PROMPTS_DIR, part + '.md')
  if (!existsSync(file)) throw new Error('teaching-commons: missing prompt fragment ' + file)
  return readFileSync(file, 'utf8').trim()
}

/**
 * Compose the shared fragments and a mode's own prompt into one section body.
 * @param parts - shared fragments, in order.
 * @param own - the mode's own prompt text.
 * @returns the joined text with a single trailing newline.
 */
export function composePrompt(parts: readonly SharedPart[], own: string): string {
  const blocks = parts.map(sharedPrompt)
  blocks.push(own.trim())
  return blocks.filter(block => block.length > 0).join('\n\n') + '\n'
}

/** Subject notes shipped with this package. */
export function availableNotes(): string[] {
  return ['math', 'arts'].filter(candidate => existsSync(join(NOTES_DIR, candidate + '.md')))
}

/**
 * Read one subject note, or explain which names exist.
 * @param note - subject key supplied by the model.
 * @returns the note body, or a model-facing error sentence.
 */
export function readNote(note: string): string {
  const key = note.trim().toLowerCase()
  if (!/^[a-z]+$/.test(key)) return `备注名只能是小写字母：收到的是 ${JSON.stringify(note)}。`
  const file = join(NOTES_DIR, key + '.md')
  if (!existsSync(file)) return `没有 ${key} 这个科目的备注。可用的有：${availableNotes().join('、')}。`
  return readFileSync(file, 'utf8')
}
