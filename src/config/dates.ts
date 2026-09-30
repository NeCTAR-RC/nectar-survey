/**
 * Date and time arithmetic for survey windows. Survey boundaries are local
 * wall-clock minutes in the survey's own time zone, so every comparison works
 * on "YYYY-MM-DDTHH:mm" strings, which sort in time order. The once-a-day
 * rule works on "YYYY-MM-DD" calendar days in the same zone.
 */

import type { Survey } from "./config.ts";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

/** Which end of a survey window a value belongs to. */
export type Boundary = "opens" | "closes";

/** The time a date-only boundary stands for: the first or the last minute. */
const IMPLIED_TIME: Record<Boundary, string> = {
  opens: "00:00",
  closes: "23:59",
};

const DAY_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
};

// `hourCycle: "h23"` keeps midnight at "00"; `hour12: false` can print it as
// "24" in some engines.
const MINUTE_FORMAT: Intl.DateTimeFormatOptions = {
  ...DAY_FORMAT,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
};

/** Looks up the parts of `date` formatted with `format` in `timeZone`. */
function zonedParts(
  date: Date,
  timeZone: string,
  format: Intl.DateTimeFormatOptions,
): (type: Intl.DateTimeFormatPartTypes) => string {
  const parts = new Intl.DateTimeFormat("en-US", {
    ...format,
    timeZone,
  }).formatToParts(date);
  return (type) => parts.find((p) => p.type === type)?.value ?? "";
}

/** "YYYY-MM-DD" from looked-up parts; the year is padded to four digits. */
function dayString(part: (type: Intl.DateTimeFormatPartTypes) => string) {
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}

/**
 * Returns the calendar day of `date` as seen in `timeZone`, formatted
 * "YYYY-MM-DD". For example 2026-10-12T14:00Z is already "2026-10-13" in
 * Australia/Melbourne. Throws a RangeError for an unknown time zone; callers
 * validate time zones with `isValidTimeZone` first.
 */
export function calendarDay(date: Date, timeZone: string): string {
  return dayString(zonedParts(date, timeZone, DAY_FORMAT));
}

/**
 * Returns the wall-clock minute of `date` as seen in `timeZone`, formatted
 * "YYYY-MM-DDTHH:mm" (24-hour). For example 2026-10-12T14:00Z is
 * "2026-10-13T01:00" in Australia/Melbourne. Throws a RangeError for an
 * unknown time zone, like `calendarDay`.
 */
export function localMinute(date: Date, timeZone: string): string {
  const part = zonedParts(date, timeZone, MINUTE_FORMAT);
  return `${dayString(part)}T${part("hour")}:${part("minute")}`;
}

/**
 * True when the survey's time zone shows a time within `opens` to `closes`
 * at `now`, at minute precision. Both ends are inclusive.
 */
export function isOpen(survey: Survey, now: Date): boolean {
  const minute = localMinute(now, survey.timezone);
  return minute >= survey.opens && minute <= survey.closes;
}

/**
 * True when `value` is "YYYY-MM-DD" and names a real day, so "2026-02-30"
 * and "2026-13-01" are rejected.
 */
export function isValidDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  // Not Date.UTC(year, ...): it reads years 0 to 99 as 1900 to 1999, which
  // made every date invalid while a year was being typed one digit at a time.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * True when `value` is "YYYY-MM-DDTHH:mm" (24-hour, no seconds, no offset)
 * on a real day, so "2026-02-30T09:00" and "2026-10-13T25:00" are rejected.
 */
export function isValidDateTime(value: string): boolean {
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) return false;
  const [, day, hour, minute] = match;
  return isValidDate(day) && Number(hour) <= 23 && Number(minute) <= 59;
}

/**
 * The "YYYY-MM-DDTHH:mm" minute an `opens` or `closes` value stands for, or
 * undefined when it is neither a date nor a date and time. A date alone
 * means 00:00 for `opens` and 23:59 for `closes`, so a date-only window
 * covers whole days.
 */
export function boundaryMinute(
  value: string,
  boundary: Boundary,
): string | undefined {
  if (isValidDateTime(value)) return value;
  if (isValidDate(value)) return `${value}T${IMPLIED_TIME[boundary]}`;
  return undefined;
}

/** True when `Intl.DateTimeFormat` accepts `timeZone` as an IANA zone. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
