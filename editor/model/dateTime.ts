/**
 * The editor's date and time fields: between draft text and the
 * `CalendarDateTime` a library `DateField` holds, and the hint under Opens
 * and Closes that says what a boundary means on the editor's own clock.
 */

import {
  parseDateTime,
  toZoned,
  type CalendarDateTime,
} from "@internationalized/date";
import { DEFAULT_TIMEZONE } from "../../src/config/config.ts";
import {
  boundaryMinute,
  isValidTimeZone,
  type Boundary,
} from "../../src/config/dates.ts";

/**
 * The field value for `boundary` draft text: a date and time as typed, a
 * date alone at its implied time, or null (an empty field) for anything else.
 */
export function boundaryFieldValue(
  value: string,
  boundary: Boundary,
): CalendarDateTime | null {
  const minute = boundaryMinute(value, boundary);
  return minute === undefined ? null : parseDateTime(minute);
}

/**
 * "YYYY-MM-DDTHH:mm" for a field value, or "" for an empty field. Not
 * `toString()` alone: that adds seconds, which the config does not accept.
 */
export function minuteText(value: CalendarDateTime | null): string {
  if (value === null) return "";
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(value.year, 4)}-${pad(value.month)}-${pad(value.day)}T${pad(value.hour)}:${pad(value.minute)}`;
}

/** The browser's own IANA time zone. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * "In your time zone (Australia/Perth): 7:00 am, Tuesday 13 October 2026."
 * for the `boundary` value of a survey counted in `surveyZone` (empty means
 * the popup default), seen from `browserZone`. A date alone stands for its
 * implied time. Undefined when the two zones are the same (compared by
 * canonical name, so an alias such as Australia/Canberra matches
 * Australia/Sydney), when the survey zone is unknown, or when the value is
 * not a date and time.
 */
export function browserTimeHint(
  value: string,
  boundary: Boundary,
  surveyZone: string,
  browserZone: string,
): string | undefined {
  const zone = surveyZone.trim() === "" ? DEFAULT_TIMEZONE : surveyZone;
  if (!isValidTimeZone(zone)) return undefined;
  if (canonicalZone(zone) === canonicalZone(browserZone)) return undefined;
  const minute = boundaryMinute(value, boundary);
  if (minute === undefined) return undefined;

  const instant = toZoned(parseDateTime(minute), zone).toDate();
  return `In your time zone (${browserZone}): ${clockTime(instant, browserZone)}, ${longDay(instant, browserZone)}.`;
}

/** The zone name `Intl` settles on, so aliases compare equal. */
function canonicalZone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", { timeZone }).resolvedOptions()
    .timeZone;
}

/**
 * Looks up the parts of `date` formatted with `format` in `timeZone`. The
 * hint is assembled from parts, because the spacing and commas of a whole
 * formatted string differ between browser versions.
 */
function parts(
  date: Date,
  timeZone: string,
  format: Intl.DateTimeFormatOptions,
): (type: Intl.DateTimeFormatPartTypes) => string {
  const list = new Intl.DateTimeFormat("en-AU", {
    ...format,
    timeZone,
  }).formatToParts(date);
  return (type) => list.find((p) => p.type === type)?.value ?? "";
}

/** "7:00 am": 12-hour clock, lower-case day period. */
function clockTime(date: Date, timeZone: string): string {
  const part = parts(date, timeZone, {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  });
  return `${part("hour")}:${part("minute")} ${part("dayPeriod").toLowerCase()}`;
}

/** "Tuesday 13 October 2026". */
function longDay(date: Date, timeZone: string): string {
  const part = parts(date, timeZone, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${part("weekday")} ${part("day")} ${part("month")} ${part("year")}`;
}
