/**
 * The survey config (`surveys.json`): types, validation, the HTML sanitiser,
 * and service and url resolution. Nothing here throws on bad input; invalid
 * surveys are dropped with one `console.warn` line each, since a dropped
 * survey is a config mistake someone should fix.
 */

import { boundaryMinute, isValidTimeZone, type Boundary } from "./dates.ts";

/** One validated survey, with every default applied. */
export interface Survey {
  /** Stable identifier; the browser stores the user's choices under it. */
  id: string;
  enabled: boolean;
  /**
   * Set by the editor when a survey is kept in the file for the record only.
   * The popup never shows an archived survey, whatever its other fields say.
   */
  archived: boolean;
  /**
   * First minute, "YYYY-MM-DDTHH:mm", inclusive, wall-clock time in
   * `timezone`. A date-only value in the file arrives here as `T00:00`.
   */
  opens: string;
  /**
   * Last minute, "YYYY-MM-DDTHH:mm", inclusive, wall-clock time in
   * `timezone`. A date-only value in the file arrives here as `T23:59`.
   */
  closes: string;
  /** IANA time zone, default "Australia/Melbourne". */
  timezone: string;
  /** Service names that show this survey, or "all". */
  services: "all" | string[];
  /**
   * Optional short label shown above the title, plain text. Like `title`
   * and `body`, it may hold the placeholder `{service}`, which `renderText`
   * replaces with the host's service name.
   */
  eyebrow?: string;
  /** The title as HTML with every character escaped (so plain text only). */
  title: string;
  /** Paragraphs as sanitised HTML (see `sanitiseHtml`). */
  body: string[];
  /** Survey link shared by every service. */
  url?: string;
  /**
   * Survey link per service name. A usable entry for the host's service is
   * used instead of `url`; see `resolveSurveyUrl`.
   */
  urls?: Record<string, string>;
  /** Plain text label, default "Start survey". */
  startLabel: string;
  /** Plain text label, default "Not right now". */
  laterLabel: string;
  /** Plain text label, default "Don't show me this again". */
  dismissLabel: string;
}

export const DEFAULT_TIMEZONE = "Australia/Melbourne";
export const DEFAULT_START_LABEL = "Start survey";
export const DEFAULT_LATER_LABEL = "Not right now";
export const DEFAULT_DISMISS_LABEL = "Don't show me this again";

const LOG_PREFIX = "nectar-survey:";
const SERVICE_PLACEHOLDER = /\{service\}/g;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Parses a fetched `surveys.json` document of the shape
 * `{ "surveys": [...] }` into validated surveys, in config order.
 *
 * A survey is dropped (one `console.warn` line each) when `id`, `title`,
 * `opens`, `closes` or `services` is missing or invalid, when `opens` is
 * after `closes`, or when `body` is neither a string nor a list of strings.
 * `opens` and `closes` come out as "YYYY-MM-DDTHH:mm" (see `boundaryMinute`).
 * An unknown `timezone` falls back to the default with a `console.warn`
 * line. Optional keys get their defaults and unknown keys are ignored. A
 * missing url does not drop a survey here, since the url depends on the
 * service; the rules skip it instead. Never throws.
 */
export function parseConfig(json: unknown): Survey[] {
  if (!isObject(json) || !Array.isArray(json.surveys)) {
    console.warn(`${LOG_PREFIX} config has no "surveys" list, ignored`);
    return [];
  }
  const surveys: Survey[] = [];
  json.surveys.forEach((entry: unknown, index: number) => {
    const result = parseSurvey(entry);
    if (typeof result === "string") {
      const id =
        isObject(entry) && isNonEmptyString(entry.id)
          ? `"${entry.id}"`
          : `at index ${index}`;
      console.warn(`${LOG_PREFIX} survey ${id} skipped: ${result}`);
    } else {
      surveys.push(result);
    }
  });
  return surveys;
}

/** Validates one survey entry; returns the reason as a string when invalid. */
function parseSurvey(entry: unknown): Survey | string {
  if (!isObject(entry)) return "not an object";
  if (!isNonEmptyString(entry.id)) return "missing id";
  if (!isNonEmptyString(entry.title)) return "missing title";
  const opens =
    typeof entry.opens === "string"
      ? boundaryMinute(entry.opens, "opens")
      : undefined;
  if (opens === undefined) return boundaryReason("opens");
  const closes =
    typeof entry.closes === "string"
      ? boundaryMinute(entry.closes, "closes")
      : undefined;
  if (closes === undefined) return boundaryReason("closes");
  if (opens > closes) return "opens is after closes";

  const services = parseServices(entry.services);
  if (services === undefined) {
    return 'services must be "all" or a list of service names';
  }
  const body = parseBody(entry.body);
  if (body === undefined) return "body must be a string or a list of strings";

  let timezone = DEFAULT_TIMEZONE;
  if (entry.timezone !== undefined) {
    if (typeof entry.timezone === "string" && isValidTimeZone(entry.timezone)) {
      timezone = entry.timezone;
    } else {
      console.warn(
        `${LOG_PREFIX} survey "${entry.id}": unknown timezone, using ${DEFAULT_TIMEZONE}`,
      );
    }
  }

  const survey: Survey = {
    id: entry.id,
    enabled: entry.enabled === true,
    archived: entry.archived === true,
    opens,
    closes,
    timezone,
    services,
    title: escapeHtml(entry.title),
    body: body.map(sanitiseHtml),
    startLabel: labelOr(entry.startLabel, DEFAULT_START_LABEL),
    laterLabel: labelOr(entry.laterLabel, DEFAULT_LATER_LABEL),
    dismissLabel: labelOr(entry.dismissLabel, DEFAULT_DISMISS_LABEL),
  };
  if (isNonEmptyString(entry.eyebrow)) survey.eyebrow = entry.eyebrow;
  if (typeof entry.url === "string") survey.url = entry.url;
  if (isObject(entry.urls)) {
    const urls: Record<string, string> = {};
    for (const [service, url] of Object.entries(entry.urls)) {
      if (typeof url === "string") urls[service] = url;
    }
    survey.urls = urls;
  }
  return survey;
}

/** Why an `opens` or `closes` value was refused, with an example of the form. */
function boundaryReason(boundary: Boundary): string {
  return `${boundary} must be a date, or a date and time, such as 2026-10-13T09:00`;
}

function parseServices(value: unknown): "all" | string[] | undefined {
  if (value === "all") return "all";
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(isNonEmptyString)
  ) {
    return [...value];
  }
  return undefined;
}

function parseBody(value: unknown): string[] | undefined {
  if (value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return [...value];
  }
  return undefined;
}

function labelOr(value: unknown, fallback: string): string {
  return isNonEmptyString(value) ? value : fallback;
}

/**
 * Returns the survey link for `service`: the `urls` entry for that service
 * when it is a usable http(s) url, otherwise the shared `url` when that is
 * usable, otherwise undefined. The result is the normalised absolute url.
 */
export function resolveSurveyUrl(
  survey: Survey,
  service: string,
): string | undefined {
  const perService =
    survey.urls && Object.hasOwn(survey.urls, service)
      ? survey.urls[service]
      : undefined;
  return httpUrl(perService) ?? httpUrl(survey.url);
}

/** True when `survey.services` is "all" or lists `service` exactly (case sensitive). */
export function servicesMatch(survey: Survey, service: string): boolean {
  return survey.services === "all" || survey.services.includes(service);
}

/**
 * Replaces every `{service}` placeholder in `template` with `service`.
 * `template` is one of the survey's HTML fields (`title` or a `body` entry),
 * so `service` is HTML-escaped first and the result stays safe to assign to
 * `innerHTML`.
 */
export function renderText(template: string, service: string): string {
  return fillService(template, escapeHtml(service));
}

/**
 * Replaces every `{service}` in `template` with `service` as plain text, for
 * fields rendered as text rather than HTML (the eyebrow).
 */
export function fillService(template: string, service: string): string {
  return template.replace(SERVICE_PLACEHOLDER, () => service);
}

/**
 * Escapes `&`, `<`, `>` and `"` so `text` shows as literal text in HTML
 * content and in double-quoted attribute values.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Whitelist HTML sanitiser for survey text. Keeps `<strong>`, `<em>` and
 * `<a href="http(s)://...">`; links get `rel="noopener"` and
 * `target="_blank"`, and every other attribute is dropped. Any other element
 * (including an `<a>` without an http(s) href) is shown as literal text, and
 * comments are removed.
 *
 * The input is parsed by the browser's own HTML parser in an inert
 * `<template>` (no scripts run, nothing loads), and the output is rebuilt
 * from the parsed tree, so unclosed, nested or malformed markup always
 * produces balanced, safe HTML.
 */
export function sanitiseHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  return serialiseChildren(template.content);
}

function serialiseChildren(parent: Node): string {
  let out = "";
  for (const node of Array.from(parent.childNodes)) {
    out += serialiseNode(node);
  }
  return out;
}

function serialiseNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? "");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as Element;
  const tag = element.localName;
  if (tag === "strong" || tag === "em") {
    return `<${tag}>${serialiseChildren(element)}</${tag}>`;
  }
  if (tag === "a") {
    const href = httpUrl(element.getAttribute("href"));
    if (href !== undefined) {
      return `<a href="${escapeHtml(href)}" rel="noopener" target="_blank">${serialiseChildren(element)}</a>`;
    }
  }
  // Show the element's markup, as the parser understood it, as text.
  return escapeHtml(element.outerHTML);
}

/** The normalised url when `value` is an absolute http or https url. */
function httpUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
