/**
 * The draft as `surveys.json` text and back: key order and formatting on the
 * way out, and on the way in a readable message with line and column when
 * the text is not a config.
 */

import {
  isRecord,
  isStringList,
  newKey,
  type Draft,
  type DraftSurvey,
  type JsonValue,
} from "./draft.ts";

/** Why a text could not be read as a config file. */
export interface JsonProblem {
  message: string;
  line?: number;
  column?: number;
}

export type FromJsonResult =
  { ok: true; draft: Draft } | { ok: false; problem: JsonProblem };

const KNOWN_SURVEY_KEYS = new Set([
  "id",
  "enabled",
  "archived",
  "opens",
  "closes",
  "timezone",
  "services",
  "eyebrow",
  "title",
  "body",
  "url",
  "urls",
  "startLabel",
  "laterLabel",
  "dismissLabel",
]);

/**
 * The survey as a config object, keys in the README's config-reference order
 * followed by unknown keys as they were. Empty optional fields, blank
 * paragraphs, blank service names and empty per-service links are left out.
 */
export function toSurveyObject(survey: DraftSurvey): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {
    id: survey.id,
    enabled: survey.enabled,
  };
  if (survey.archived) out.archived = true;
  out.opens = survey.opens;
  out.closes = survey.closes;
  if (survey.timezone.trim() !== "") out.timezone = survey.timezone;
  out.services = survey.allServices
    ? "all"
    : survey.services.filter((service) => service.trim() !== "");
  if (survey.eyebrow !== "") out.eyebrow = survey.eyebrow;
  out.title = survey.title;
  const body = survey.body.filter((paragraph) => paragraph.trim() !== "");
  if (body.length > 0) out.body = body;
  if (survey.url !== "") out.url = survey.url;
  const urls = Object.fromEntries(
    Object.entries(survey.urls).filter(([, url]) => url !== ""),
  );
  if (Object.keys(urls).length > 0) out.urls = urls;
  if (survey.startLabel !== "") out.startLabel = survey.startLabel;
  if (survey.laterLabel !== "") out.laterLabel = survey.laterLabel;
  if (survey.dismissLabel !== "") out.dismissLabel = survey.dismissLabel;
  for (const [key, value] of Object.entries(survey.extra)) {
    if (!KNOWN_SURVEY_KEYS.has(key)) out[key] = value;
  }
  return out;
}

/** The whole draft as a config object (`{ "surveys": [...] }` first). */
export function toConfigObject(draft: Draft): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {
    surveys: draft.surveys.map(toSurveyObject),
  };
  for (const [key, value] of Object.entries(draft.extra)) {
    if (key !== "surveys") out[key] = value;
  }
  return out;
}

/** The file text: two-space indent and a trailing newline. */
export function toJson(draft: Draft): string {
  return `${JSON.stringify(toConfigObject(draft), null, 2)}\n`;
}

/**
 * Reads config text into a draft. Fails with a line and column on a JSON
 * syntax error, and with a plain message when a known key has a type the
 * form cannot hold (for example a number as `title`). Missing keys become
 * empty fields; `validate` reports what that means for the popup.
 */
export function fromJson(text: string): FromJsonResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, problem: syntaxProblem(text, error) };
  }
  if (!isRecord(json) || !Array.isArray(json.surveys)) {
    return {
      ok: false,
      problem: { message: 'The file needs a "surveys" list at the top level.' },
    };
  }
  const surveys: DraftSurvey[] = [];
  for (const [index, entry] of json.surveys.entries()) {
    const result = readSurvey(entry, index);
    if (typeof result === "string") {
      return { ok: false, problem: { message: result } };
    }
    surveys.push(result);
  }
  const extra: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(json)) {
    if (key !== "surveys") extra[key] = value as JsonValue;
  }
  return { ok: true, draft: { surveys, extra } };
}

/** One survey entry into the draft shape, or why it does not fit. */
function readSurvey(entry: unknown, index: number): DraftSurvey | string {
  const where = `The survey at position ${index + 1}`;
  if (!isRecord(entry)) return `${where} is not an object.`;
  const name =
    typeof entry.id === "string" && entry.id !== ""
      ? `Survey "${entry.id}"`
      : where;

  const text = (key: string): string | undefined => {
    const value = entry[key];
    if (value === undefined || value === null) return "";
    return typeof value === "string" ? value : undefined;
  };
  const fields: Record<string, string> = {};
  for (const key of [
    "id",
    "opens",
    "closes",
    "timezone",
    "eyebrow",
    "title",
    "url",
    "startLabel",
    "laterLabel",
    "dismissLabel",
  ]) {
    const value = text(key);
    if (value === undefined) return `${name}: "${key}" must be text.`;
    fields[key] = value;
  }

  for (const flag of ["enabled", "archived"] as const) {
    if (entry[flag] !== undefined && typeof entry[flag] !== "boolean") {
      return `${name}: "${flag}" must be true or false.`;
    }
  }

  let allServices = false;
  let services: string[] = [];
  if (entry.services === "all") {
    allServices = true;
  } else if (entry.services === undefined) {
    services = [];
  } else if (isStringList(entry.services)) {
    services = [...entry.services];
  } else {
    return `${name}: "services" must be "all" or a list of service names.`;
  }

  let body: string[];
  if (entry.body === undefined) body = [];
  else if (typeof entry.body === "string") body = [entry.body];
  else if (isStringList(entry.body)) body = [...entry.body];
  else return `${name}: "body" must be text or a list of paragraphs.`;

  const urls: Record<string, string> = {};
  if (entry.urls !== undefined) {
    if (!isRecord(entry.urls)) {
      return `${name}: "urls" must map service names to links.`;
    }
    for (const [service, url] of Object.entries(entry.urls)) {
      if (typeof url !== "string") {
        return `${name}: the link for "${service}" must be text.`;
      }
      urls[service] = url;
    }
  }

  const extra: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!KNOWN_SURVEY_KEYS.has(key)) extra[key] = value as JsonValue;
  }

  return {
    key: newKey(),
    id: fields.id,
    enabled: entry.enabled === true,
    archived: entry.archived === true,
    opens: fields.opens,
    closes: fields.closes,
    timezone: fields.timezone,
    allServices,
    services,
    eyebrow: fields.eyebrow,
    title: fields.title,
    body,
    url: fields.url,
    urls,
    startLabel: fields.startLabel,
    laterLabel: fields.laterLabel,
    dismissLabel: fields.dismissLabel,
    extra,
  };
}

/**
 * Turns a `JSON.parse` error into a message with a line and column. Browsers
 * word the message differently and do not always give a position, so the
 * position comes from `jsonErrorOffset`; the browser's own words are kept,
 * without their position and text excerpt.
 */
function syntaxProblem(text: string, error: unknown): JsonProblem {
  if (text.trim() === "") return { message: "The text is empty." };
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw
    .replace(/^JSON\.parse: /, "")
    .replace(/ in JSON at position \d+.*$/, "")
    .replace(/, .*is not valid JSON$/s, "")
    .replace(/ at line \d+ column \d+ of the JSON data$/, "");
  const offset = jsonErrorOffset(text) ?? text.length;
  const before = text.slice(0, offset).split("\n");
  return {
    message,
    line: before.length,
    column: before[before.length - 1].length + 1,
  };
}

/** Thrown inside `jsonErrorOffset` to stop at the first problem. */
class JsonStop {
  readonly offset: number;

  constructor(offset: number) {
    this.offset = offset;
  }
}

/**
 * The character offset of the first JSON syntax error in `text`, or
 * undefined when `text` is valid JSON. A small scanner that follows the JSON
 * grammar (RFC 8259) and only looks for where it breaks.
 */
export function jsonErrorOffset(text: string): number | undefined {
  let i = 0;
  const fail = (): never => {
    throw new JsonStop(i);
  };
  const skipSpace = (): void => {
    while (i < text.length && " \t\n\r".includes(text[i])) i += 1;
  };
  const expect = (char: string): void => {
    if (text[i] !== char) fail();
    i += 1;
  };
  const string = (): void => {
    expect('"');
    while (i < text.length) {
      const char = text[i];
      if (char === '"') {
        i += 1;
        return;
      }
      if (char < " ") fail();
      if (char === "\\") {
        const escape = text[i + 1] ?? "";
        if (escape === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) fail();
          i += 6;
          continue;
        }
        i += 1;
        if (escape === "" || !'"\\/bfnrt'.includes(escape)) fail();
      }
      i += 1;
    }
    fail();
  };
  const value = (): void => {
    skipSpace();
    const char = text[i];
    if (char === "{") {
      i += 1;
      skipSpace();
      if (text[i] === "}") {
        i += 1;
        return;
      }
      for (;;) {
        skipSpace();
        string();
        skipSpace();
        expect(":");
        value();
        skipSpace();
        if (text[i] === "}") {
          i += 1;
          return;
        }
        expect(",");
      }
    }
    if (char === "[") {
      i += 1;
      skipSpace();
      if (text[i] === "]") {
        i += 1;
        return;
      }
      for (;;) {
        value();
        skipSpace();
        if (text[i] === "]") {
          i += 1;
          return;
        }
        expect(",");
      }
    }
    if (char === '"') return string();
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      text.slice(i),
    );
    if (number) {
      i += number[0].length;
      return;
    }
    for (const word of ["true", "false", "null"]) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return;
      }
    }
    fail();
  };
  try {
    value();
    skipSpace();
    if (i < text.length) fail();
    return undefined;
  } catch (error) {
    if (error instanceof JsonStop) return error.offset;
    throw error;
  }
}

/** "Line 3, column 5: Expected ..." when the position is known. */
export function describeProblem(problem: JsonProblem): string {
  return problem.line === undefined
    ? problem.message
    : `Line ${problem.line}, column ${problem.column}: ${problem.message}`;
}
