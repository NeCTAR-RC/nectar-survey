/**
 * Field-level validation of a draft. The popup's own modules (`src/config/`)
 * stay the truth for what a valid survey is; this module maps their verdicts
 * onto form fields and adds warnings about things that are valid but
 * probably not what was meant.
 */

import {
  DEFAULT_TIMEZONE,
  parseConfig,
  resolveSurveyUrl,
  sanitiseHtml,
  servicesMatch,
  type Survey,
} from "../../src/config/config.ts";
import {
  boundaryMinute,
  isValidTimeZone,
  localMinute,
  type Boundary,
} from "../../src/config/dates.ts";
import {
  effectiveServices,
  isKnownService,
  serviceNames,
  type Draft,
  type DraftSurvey,
} from "./draft.ts";
import { toSurveyObject } from "./json.ts";

/**
 * Where a survey stands in time at `now`, as the popup reads its dates:
 * before Opens, from Opens to Closes (both minutes included), or after Closes.
 */
export type SurveyTiming = "upcoming" | "open" | "closed";

/** A problem found by `validate`, placed on a survey field when it has one. */
export interface Issue {
  surveyIndex?: number;
  /** A draft field name, `body.<n>` for a paragraph or `urls.<service>`. */
  field?: string;
  message: string;
}

export interface Validation {
  /** Problems that make the popup skip a survey or misread the file. */
  errors: Issue[];
  /** Valid but probably not what was meant. */
  warnings: Issue[];
  /**
   * Each survey's timing at `now`, indexed like `draft.surveys`; undefined
   * where the popup skips the survey (its dates may not read). Not a
   * warning: a closed survey stays in the file as a record, and the editor
   * marks it and lets the list filter by it.
   */
  timing: (SurveyTiming | undefined)[];
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SERVICE_PLACEHOLDER = "{service}";

/**
 * Checks the draft against the popup's own rules and adds warnings.
 *
 * Errors are everything that makes the popup skip a survey (the same
 * conditions as `parseConfig`, placed on the field at fault), plus an unknown
 * time zone (the popup would silently use Melbourne), a link that is not an
 * http(s) address, and a repeated id (surveys would share one saved state).
 * Warnings are listed in `surveyWarnings` and `crossSurveyWarnings`.
 * `now` sets the current time for each survey's `timing` and for the "more
 * than a year away" warning.
 */
export function validate(draft: Draft, now: Date = new Date()): Validation {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const timing: (SurveyTiming | undefined)[] = [];
  const parsed: (Survey | undefined)[] = [];
  const names = serviceNames(draft);

  draft.surveys.forEach((survey, surveyIndex) => {
    const surveyErrors = fieldErrors(survey, names).map((issue) => ({
      surveyIndex,
      ...issue,
    }));
    const firstWithId = draft.surveys.findIndex((s) => s.id === survey.id);
    if (survey.id.trim() !== "" && firstWithId !== surveyIndex) {
      surveyErrors.push({
        surveyIndex,
        field: "id",
        message: `The survey at position ${firstWithId + 1} already uses this id. Each survey needs its own, because the browser remembers choices by id.`,
      });
    }
    const result = surveyErrors.length === 0 ? parseOne(survey) : undefined;
    if (surveyErrors.length === 0 && result === undefined) {
      // A rule of parseConfig that fieldErrors does not know about yet.
      surveyErrors.push({
        surveyIndex,
        message: "The popup would skip this survey.",
      });
    }
    errors.push(...surveyErrors);
    parsed.push(result);
    timing.push(result && surveyTiming(result, now));
    // An archived survey is out of play, so nothing about it is "probably
    // not what was meant"; its errors still count, since the popup parses it.
    if (!survey.archived) {
      warnings.push(
        ...surveyWarnings(survey, result, now, names).map((issue) => ({
          surveyIndex,
          ...issue,
        })),
      );
    }
  });

  warnings.push(...crossSurveyWarnings(draft, parsed, names));
  for (const key of Object.keys(draft.extra)) {
    warnings.push({
      message: `The file has an unknown top-level key "${key}". It is kept, but the popup ignores it.`,
    });
  }
  return { errors, warnings, timing };
}

/** Where a parsed survey stands in time at `now`, in its own time zone. */
function surveyTiming(survey: Survey, now: Date): SurveyTiming {
  const current = localMinute(now, survey.timezone);
  if (survey.closes < current) return "closed";
  if (survey.opens > current) return "upcoming";
  return "open";
}

/** The survey as the popup reads it, or undefined when the popup skips it. */
function parseOne(survey: DraftSurvey): Survey | undefined {
  return parseConfig({ surveys: [toSurveyObject(survey)] })[0];
}

/**
 * Field-level reasons the popup would skip `survey` or misread it. Uses the
 * same checks as `parseConfig` (`boundaryMinute`, `isValidTimeZone`, non-empty
 * text), one message per field.
 */
function fieldErrors(survey: DraftSurvey, names: readonly string[]): Issue[] {
  const issues: Issue[] = [];
  if (survey.id.trim() === "") {
    issues.push({ field: "id", message: "Enter an id, such as nectar-2026." });
  }
  if (survey.title.trim() === "") {
    issues.push({ field: "title", message: "Enter a title." });
  }
  const opens = boundaryMinute(survey.opens, "opens");
  const closes = boundaryMinute(survey.closes, "closes");
  if (opens === undefined) {
    issues.push({ field: "opens", message: boundaryMessage("opens", survey) });
  }
  if (closes === undefined) {
    issues.push({
      field: "closes",
      message: boundaryMessage("closes", survey),
    });
  }
  if (opens !== undefined && closes !== undefined && opens > closes) {
    issues.push({
      field: "closes",
      message: "The closing time is before the opening time.",
    });
  }
  if (survey.timezone.trim() !== "" && !isValidTimeZone(survey.timezone)) {
    issues.push({
      field: "timezone",
      message: `"${survey.timezone}" is not a time zone this browser knows. Use an IANA name such as Pacific/Auckland.`,
    });
  }
  if (effectiveServices(survey, names).length === 0) {
    issues.push({
      field: "services",
      message: "Choose at least one service, or all services.",
    });
  }
  if (survey.url !== "" && !isUsableUrl(survey.url)) {
    issues.push({ field: "url", message: urlMessage });
  }
  for (const [service, url] of Object.entries(survey.urls)) {
    if (url !== "" && !isUsableUrl(url)) {
      issues.push({ field: `urls.${service}`, message: urlMessage });
    }
  }
  return issues;
}

const urlMessage =
  "Enter a full web address starting with https:// (or http://).";

/** Why the `boundary` field of `survey` is not a usable date and time. */
function boundaryMessage(boundary: Boundary, survey: DraftSurvey): string {
  if (survey[boundary] === "") return "Enter a date and time.";
  const label = boundary === "opens" ? "Opens" : "Closes";
  return `${label} must be a date, or a date and time, such as 2026-10-13T09:00.`;
}

/** True when the popup would accept `url` as a survey link. */
export function isUsableUrl(url: string): boolean {
  const probe: Survey = {
    id: "",
    enabled: true,
    archived: false,
    opens: "",
    closes: "",
    timezone: DEFAULT_TIMEZONE,
    services: "all",
    title: "",
    body: [],
    url,
    startLabel: "",
    laterLabel: "",
    dismissLabel: "",
  };
  return resolveSurveyUrl(probe, "") !== undefined;
}

/** Warnings about one survey on its own. `parsed` is undefined when invalid. */
function surveyWarnings(
  survey: DraftSurvey,
  parsed: Survey | undefined,
  now: Date,
  names: readonly string[],
): Issue[] {
  const issues: Issue[] = [];

  if (survey.id !== "" && !SLUG.test(survey.id)) {
    issues.push({
      field: "id",
      message:
        "Ids are easiest to work with as lower-case letters, digits and hyphens, such as nectar-2026.",
    });
  }
  if (survey.liveId !== undefined && survey.id !== survey.liveId) {
    issues.push({
      field: "id",
      message: `The live file calls this survey "${survey.liveId}". A new id makes it a new survey, so people who already started or dismissed it are asked again.`,
    });
  }

  if (parsed && parsed.enabled) {
    const missing = effectiveServices(survey, names).filter(
      (service) => resolveSurveyUrl(parsed, service) === undefined,
    );
    if (
      missing.length > 0 &&
      missing.length === effectiveServices(survey, names).length
    ) {
      issues.push({
        field: "url",
        message:
          "This survey is enabled but has no survey link, so the popup does not show it anywhere.",
      });
    } else {
      for (const service of missing) {
        issues.push({
          field: `urls.${service}`,
          message: `No link for ${service}, so the popup does not show this survey there.`,
        });
      }
    }
  }

  if (parsed) {
    const current = localMinute(now, parsed.timezone);
    if (parsed.opens > sameTimeNextYear(current)) {
      issues.push({
        field: "opens",
        message: "This survey opens more than a year from today.",
      });
    }
  }

  // Only names the survey writes itself: "all" lists none.
  const listed = survey.allServices ? [] : effectiveServices(survey, names);
  for (const service of listed) {
    if (!isKnownService(service)) {
      issues.push({
        field: "services",
        message: `"${service}" is not a service the editor knows. It only matches a host that sends exactly this name; check the spelling.`,
      });
    }
  }

  if (survey.title !== "" && !survey.title.includes(SERVICE_PLACEHOLDER)) {
    issues.push({
      field: "title",
      message:
        "The title has no {service} placeholder, so it reads the same on every service.",
    });
  }
  for (const field of [
    "eyebrow",
    "title",
    "startLabel",
    "laterLabel",
    "dismissLabel",
  ] as const) {
    if (containsMarkup(survey[field])) {
      issues.push({
        field,
        message:
          "This field is plain text, so markup such as <strong> or &amp; shows exactly as typed.",
      });
    }
  }
  survey.body.forEach((paragraph, index) => {
    const lost = strippedMarkup(paragraph);
    if (lost.length > 0) {
      issues.push({
        field: `body.${index}`,
        message: `The popup does not keep ${lost.join(", ")}. Only <strong>, <em> and <a href="https://..."> links are kept; other markup shows as text or is removed.`,
      });
    }
  });

  for (const key of Object.keys(survey.extra)) {
    issues.push({
      message: `Unknown key "${key}". It is kept in the file, but the popup ignores it.`,
    });
  }
  return issues;
}

/**
 * Warns about enabled surveys that run for the same service at the same
 * time. The popup shows the first one in the list; a later one only reaches
 * people who have already started or dismissed the earlier one. Surveys are
 * named by id, which is unique here: a survey that repeats an earlier id has
 * an error, so it is never parsed and never reaches this check.
 */
function crossSurveyWarnings(
  draft: Draft,
  parsed: (Survey | undefined)[],
  names: readonly string[],
): Issue[] {
  const issues: Issue[] = [];
  parsed.forEach((later, laterIndex) => {
    if (!later?.enabled || later.archived) return;
    for (let earlierIndex = 0; earlierIndex < laterIndex; earlierIndex++) {
      const earlier = parsed[earlierIndex];
      if (!earlier?.enabled || earlier.archived) continue;
      if (earlier.opens > later.closes || later.opens > earlier.closes) {
        continue;
      }
      const shared = effectiveServices(draft.surveys[laterIndex], names).filter(
        (service) => servicesMatch(earlier, service),
      );
      if (shared.length === 0) continue;
      issues.push({
        surveyIndex: laterIndex,
        field: "services",
        message: `${later.id} overlaps ${earlier.id} on ${listWithAnd(shared)}. The popup shows the first matching survey in the list, so ${later.id} only reaches people who have already started or dismissed ${earlier.id}.`,
      });
    }
  });
  return issues;
}

/** "a", "a and b", "a, b and c". */
function listWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * "YYYY-MM-DDTHH:mm" one year after `minute`. Compared as text only, so
 * 29 Feb is fine.
 */
function sameTimeNextYear(minute: string): string {
  const year = Number(minute.slice(0, 4)) + 1;
  return `${String(year).padStart(4, "0")}${minute.slice(4)}`;
}

/** True when plain text holds something a browser would read as markup. */
function containsMarkup(text: string): boolean {
  if (!/[<&]/.test(text)) return false;
  const template = document.createElement("template");
  template.innerHTML = text;
  const content = template.content;
  return (
    content.textContent !== text ||
    Array.from(content.childNodes).some(
      (node) => node.nodeType !== Node.TEXT_NODE,
    )
  );
}

/**
 * What the sanitiser changes in `html`, as short descriptions such as
 * `<span>` or `attributes on <strong>`. Found by comparing the parsed input
 * with the parsed sanitiser output, so the sanitiser stays the only place
 * that decides what is kept.
 */
export function strippedMarkup(html: string): string[] {
  if (!/[<&]/.test(html)) return [];
  const before = parseFragment(html);
  const after = parseFragment(sanitiseHtml(html));
  const lost = new Set<string>();

  const keptElements = elements(after);
  const remaining = [...keptElements];
  for (const element of elements(before)) {
    const matchIndex = remaining.findIndex(
      (kept) => kept.localName === element.localName,
    );
    if (matchIndex === -1) {
      lost.add(`<${element.localName}>`);
      continue;
    }
    const [kept] = remaining.splice(matchIndex, 1);
    const dropped = element
      .getAttributeNames()
      .filter((name) => !kept.hasAttribute(name));
    if (dropped.length > 0) lost.add(`attributes on <${element.localName}>`);
  }
  if (countComments(before) > countComments(after)) lost.add("comments");
  if (lost.size === 0 && before.textContent !== after.textContent) {
    lost.add("some markup");
  }
  return [...lost];
}

function parseFragment(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}

function elements(root: DocumentFragment): Element[] {
  return Array.from(root.querySelectorAll("*"));
}

function countComments(root: DocumentFragment): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  let count = 0;
  while (walker.nextNode()) count += 1;
  return count;
}

/** The messages for one field, split by severity. */
export interface FieldIssues {
  errors: string[];
  warnings: string[];
}

/**
 * The issues of one survey, keyed by field; issues about the survey as a
 * whole are under the empty key.
 */
export function issuesForSurvey(
  validation: Validation,
  surveyIndex: number,
): Map<string, FieldIssues> {
  const byField = new Map<string, FieldIssues>();
  const add = (issue: Issue, kind: keyof FieldIssues): void => {
    if (issue.surveyIndex !== surveyIndex) return;
    const key = issue.field ?? "";
    const entry = byField.get(key) ?? { errors: [], warnings: [] };
    entry[kind].push(issue.message);
    byField.set(key, entry);
  };
  validation.errors.forEach((issue) => add(issue, "errors"));
  validation.warnings.forEach((issue) => add(issue, "warnings"));
  return byField;
}

/** The number of errors of each survey, indexed like `draft.surveys`. */
export function errorCounts(
  validation: Validation,
  surveyCount: number,
): number[] {
  const counts = new Array<number>(surveyCount).fill(0);
  for (const issue of validation.errors) {
    if (issue.surveyIndex !== undefined) counts[issue.surveyIndex] += 1;
  }
  return counts;
}

/** The DOM id of the form field an issue points at. */
export function fieldDomId(surveyIndex: number, field?: string): string {
  const base = `survey-${surveyIndex + 1}`;
  if (field === undefined) return base;
  return `${base}-${field.replace(/[^A-Za-z0-9]+/g, "-")}`;
}
