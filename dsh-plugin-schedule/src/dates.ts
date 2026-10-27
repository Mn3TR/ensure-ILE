/**
 * Local-date helpers.
 *
 * Everything in this package speaks `YYYY-MM-DD` in local time: a schoolday is a
 * calendar day, not an instant, so there are no ISO timestamps and no time-zone
 * arithmetic here. Arithmetic runs on UTC midnights so DST cannot shift a day.
 * @module dsh-plugin-schedule/dates
 */

/** Strict `YYYY-MM-DD` shape. */
export const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u

const MS_PER_DAY = 86_400_000

const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const

/** Format a calendar date the way the whole package writes it. */
export function formatLocalDate(date: Date = new Date()): string {
  return joinDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

function joinDate(year: number, month: number, day: number): string {
  return String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
}

function formatStamp(stamp: number): string {
  const date = new Date(stamp)
  return joinDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

/** The UTC midnight of a calendar date, or undefined when the value is not one. */
function stampOf(value: string): number | undefined {
  const match = DATE_PATTERN.exec(value)
  if (match === null) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const stamp = Date.UTC(year, month - 1, day)
  const check = new Date(stamp)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return undefined
  }
  return stamp
}

/** True when the value is a real calendar date written `YYYY-MM-DD`. */
export function isValidDate(value: string): boolean {
  return stampOf(value) !== undefined
}

/** Shift a calendar date by whole days; negative numbers go backwards. */
export function addDays(value: string, days: number): string {
  const stamp = stampOf(value)
  if (stamp === undefined) throw new RangeError('不是日期（要 YYYY-MM-DD）：' + value)
  return formatStamp(stamp + days * MS_PER_DAY)
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const start = stampOf(from)
  const end = stampOf(to)
  if (start === undefined) throw new RangeError('不是日期（要 YYYY-MM-DD）：' + from)
  if (end === undefined) throw new RangeError('不是日期（要 YYYY-MM-DD）：' + to)
  return Math.round((end - start) / MS_PER_DAY)
}

/** ISO weekday of a calendar date: Monday 1 … Sunday 7. */
export function weekdayOf(value: string): number {
  const stamp = stampOf(value)
  if (stamp === undefined) throw new RangeError('不是日期（要 YYYY-MM-DD）：' + value)
  return ((new Date(stamp).getUTCDay() + 6) % 7) + 1
}

/** Chinese name of an ISO weekday. */
export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday - 1] ?? ''
}

/** The `YYYY-MM-DD` head of an ISO timestamp, or undefined when it has none. */
export function datePart(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const head = value.slice(0, 10)
  return isValidDate(head) ? head : undefined
}
