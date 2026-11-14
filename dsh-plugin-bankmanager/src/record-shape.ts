/** Runtime shape checks shared by record reads and the final pre-write validation. */
type Rule = (value: unknown, path: string) => void
const fail = (path: string, expected: string): never => { throw new Error(`字段 ${path} 必须是${expected}`) }
const text: Rule = (value, path) => { if (typeof value !== 'string') fail(path, '字符串') }
const integer: Rule = (value, path) => { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(path, '非负整数') }
const positive: Rule = (value, path) => { integer(value, path); if (value === 0) fail(path, '正整数') }
const optional = (rule: Rule): Rule => (value, path) => { if (value !== undefined) rule(value, path) }
const choice = (choices: readonly unknown[]): Rule => (value, path) => { if (!choices.includes(value)) fail(path, choices.join(' / ')) }
const array = (rule: Rule): Rule => (value, path) => {
  if (!Array.isArray(value)) fail(path, '数组')
  ;(value as unknown[]).forEach((item, index) => rule(item, `${path}[${index}]`))
}
const object = (fields: Record<string, Rule>): Rule => (value, path) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, '对象')
  for (const [key, rule] of Object.entries(fields)) rule((value as Record<string, unknown>)[key], path ? path + '.' + key : key)
}

/** Domain enums are supplied by store.ts, keeping their single source of truth. */
export function recordShape(enums: {
  statuses: readonly string[], outcomes: readonly string[], affects: readonly string[], hints: readonly string[],
  matches: readonly string[], choices: readonly string[], preferences: readonly string[], mediaTypes: readonly string[],
}): Rule {
  return object({
    schema: choice([2]), id: text, subject: text, statement: text, status: choice(enums.statuses),
    createdAt: text, updatedAt: text, tags: optional(array(text)),
    attachments: optional(array(object({
      file: text, sha256: text, mediaType: choice(enums.mediaTypes), bytes: optional(integer),
      width: optional(positive), height: optional(positive), addedAt: text,
    }))),
    guide: object({ sessions: array(object({
      sessionId: optional(text), startedAt: text, endedAt: optional(text), outcome: optional(choice(enums.outcomes)),
      whereStuck: optional(text), result: optional(text), affect: optional(choice(enums.affects)), effectiveHint: optional(choice(enums.hints)),
    })), insight: optional(text) }),
    work: object({ attempts: array(object({ at: text, answer: text, verdict: text, source: choice(['text']) })) }),
    review: object({ nextAt: optional(text), interval: optional(positive), count: integer, history: array(text) }),
    history: optional(array(object({ at: text, event: text, detail: optional(text) }))),
    handoff: optional(object({
      id: text, at: text, from: text, to: text, why: text, state: text, consumedAt: optional(text), consumerSessionId: optional(text),
      detail: optional(object({ lastWords: optional(text), blocker: optional(text), nextStep: optional(text) })),
    })),
    hrl: optional(object({
      input: optional(object({ at: text, from: choice(['work', 'pasted']), attemptAt: optional(text), answer: text })),
      teacher: optional(object({
        writtenAt: text, answer: text, note: optional(text),
        steps: array(object({ index: positive, body: text, reason: text, improvement: optional(text) })),
      })),
      pairings: array(object({
        at: text, attemptAt: optional(text), result: optional(text), preference: optional(choice(enums.preferences)),
        steps: array(object({
          index: positive, studentQuote: optional(text), teacherStep: optional(positive), match: choice(enums.matches),
          chosen: optional(choice(enums.choices)), mergedText: optional(text), chosenAt: optional(text), note: optional(text),
        })),
      })),
    })),
  })
}
