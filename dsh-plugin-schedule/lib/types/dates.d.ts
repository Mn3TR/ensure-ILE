/**
 * Local-date helpers.
 *
 * Everything in this package speaks `YYYY-MM-DD` in local time: a schoolday is a
 * calendar day, not an instant, so there are no ISO timestamps and no time-zone
 * arithmetic here. Arithmetic runs on UTC midnights so DST cannot shift a day.
 * @module dsh-plugin-schedule/dates
 */
/** Strict `YYYY-MM-DD` shape. */
export declare const DATE_PATTERN: RegExp;
/** Format a calendar date the way the whole package writes it. */
export declare function formatLocalDate(date?: Date): string;
/** True when the value is a real calendar date written `YYYY-MM-DD`. */
export declare function isValidDate(value: string): boolean;
/** Shift a calendar date by whole days; negative numbers go backwards. */
export declare function addDays(value: string, days: number): string;
/** Whole days from `from` to `to`; negative when `to` is earlier. */
export declare function daysBetween(from: string, to: string): number;
/** ISO weekday of a calendar date: Monday 1 … Sunday 7. */
export declare function weekdayOf(value: string): number;
/** Chinese name of an ISO weekday. */
export declare function weekdayName(weekday: number): string;
/** The `YYYY-MM-DD` head of an ISO timestamp, or undefined when it has none. */
export declare function datePart(value: string | undefined): string | undefined;
