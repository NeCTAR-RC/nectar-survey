/**
 * The editable draft: the shape the form works on, the known services and
 * time zones, new and copied surveys, and the links between draft surveys
 * and the live file. Nothing here reads or writes JSON; see `json.ts`.
 */

import { DEFAULT_TIMEZONE } from "../../src/config/config.ts";
import { boundaryMinute, type Boundary } from "../../src/config/dates.ts";

/** The four services the popup is built for, in display order. */
export const KNOWN_SERVICES = [
  "Nectar Dashboard",
  "ARDC Jupyter Notebook Service",
  "ARDC BinderHub Service",
  "ARDC Virtual Desktop Service",
] as const;

/** Time zones offered in the timezone select; any other IANA zone is "Other". */
export const TIMEZONE_OPTIONS = [
  { id: "Australia/Melbourne", label: "Melbourne (default)" },
  { id: "Australia/Sydney", label: "Sydney" },
  { id: "Australia/Brisbane", label: "Brisbane" },
  { id: "Australia/Adelaide", label: "Adelaide" },
  { id: "Australia/Perth", label: "Perth" },
  { id: "Australia/Hobart", label: "Hobart" },
  { id: "Australia/Darwin", label: "Darwin" },
  { id: "Australia/Canberra", label: "Canberra" },
  { id: "UTC", label: "UTC" },
] as const;

/** A JSON value kept as it was read, for keys the editor does not know. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * One survey as the form edits it. Every config key is present, as text or a
 * list of text, so a half-finished survey can always be represented; an empty
 * optional field is left out of the file.
 */
export interface DraftSurvey {
  /** Editor-only identity for list rendering; never written to the file. */
  key: string;
  /** The survey's id in the live file, when it came from there. */
  liveId?: string;
  id: string;
  enabled: boolean;
  /**
   * Kept in the file for the record only: listed under the editor's
   * Archived filter, never shown by the popup. Set and cleared by the
   * editor's Archive and Unarchive actions, never automatically.
   */
  archived: boolean;
  /**
   * As typed or read: "YYYY-MM-DDTHH:mm", a date alone ("YYYY-MM-DD") from
   * an older file, or any text a file held. Never normalised on the way out.
   */
  opens: string;
  /** As `opens`. */
  closes: string;
  /** Empty means the popup default, Australia/Melbourne. */
  timezone: string;
  /** True writes `"services": "all"`; `services` is then kept but unused. */
  allServices: boolean;
  services: string[];
  eyebrow: string;
  title: string;
  body: string[];
  url: string;
  /** Survey link per service name, in file order. */
  urls: Record<string, string>;
  startLabel: string;
  laterLabel: string;
  dismissLabel: string;
  /** Keys the editor does not know, kept so a round trip loses nothing. */
  extra: Record<string, JsonValue>;
}

/** The whole file as the editor holds it. */
export interface Draft {
  surveys: DraftSurvey[];
  /** Top-level keys other than `surveys`, kept as they were. */
  extra: Record<string, JsonValue>;
}

let keyCounter = 0;

/** A new editor-only survey key, unique within this page load. */
export function newKey(): string {
  keyCounter += 1;
  return `survey-${Date.now().toString(36)}-${keyCounter}`;
}

/** An empty draft: no surveys. */
export function emptyDraft(): Draft {
  return { surveys: [], extra: {} };
}

/**
 * A new, disabled survey for all services in Melbourne time. Its suggested
 * id is the lowest free `survey-<n>`: not in `existingIds`. The four known
 * names stay in `services`, so unticking All services leaves them to work
 * with.
 */
export function newSurvey(existingIds: readonly string[]): DraftSurvey {
  return {
    key: newKey(),
    id: freeSurveyId(existingIds),
    enabled: false,
    archived: false,
    opens: "",
    closes: "",
    timezone: DEFAULT_TIMEZONE,
    allServices: true,
    services: [...KNOWN_SERVICES],
    eyebrow: "",
    title: "",
    body: [""],
    url: "",
    urls: {},
    startLabel: "",
    laterLabel: "",
    dismissLabel: "",
    extra: {},
  };
}

/** The first `survey-1`, `survey-2`, ... that is not in `existingIds`. */
function freeSurveyId(existingIds: readonly string[]): string {
  const taken = new Set(existingIds);
  let n = 1;
  while (taken.has(`survey-${n}`)) n += 1;
  return `survey-${n}`;
}

/**
 * How the editor names a survey in labels and messages: its id, or "this
 * survey" while it has none. Never its position, which changes whenever a
 * survey above it moves or goes.
 */
export function surveyName(survey: DraftSurvey): string {
  return survey.id !== "" ? survey.id : "this survey";
}

/**
 * A copy of `survey` to start the next one from: new id (`<id>-copy`), not
 * enabled, not archived, and not linked to a live survey. Date-only `opens`
 * and `closes` gain their implied times (00:00 and 23:59), so the copy
 * carries times.
 */
export function duplicateSurvey(survey: DraftSurvey): DraftSurvey {
  return {
    ...structuredClone({ ...survey, liveId: undefined }),
    key: newKey(),
    id: `${survey.id}-copy`,
    enabled: false,
    archived: false,
    opens: withImpliedTime(survey.opens, "opens"),
    closes: withImpliedTime(survey.closes, "closes"),
  };
}

/** `value` with a date alone made explicit; anything else stays as typed. */
function withImpliedTime(value: string, boundary: Boundary): string {
  return boundaryMinute(value, boundary) ?? value;
}

const KNOWN: readonly string[] = KNOWN_SERVICES;

/** True for one of the four services the popup is built for. */
export function isKnownService(name: string): boolean {
  return KNOWN.includes(name);
}

/**
 * Every service name the draft knows of: the four known services in their
 * order, then each other non-empty name a survey lists in `services` or as
 * a key of `urls`, in first-seen order, once each. The editor offers these
 * wherever it asks for a service, so a fifth service typed into one survey
 * is a choice in every other.
 */
export function serviceNames(draft: Draft): string[] {
  const names = new Set<string>(KNOWN_SERVICES);
  for (const survey of draft.surveys) {
    for (const name of [...survey.services, ...Object.keys(survey.urls)]) {
      if (name.trim() !== "") names.add(name);
    }
  }
  return [...names];
}

/**
 * The services a survey reaches. For "all" that is every name in `names`
 * (normally `serviceNames(draft)`): the popup's "all" matches any name a
 * host sends, so the warnings and the preview treat every service the
 * draft knows of as reached.
 */
export function effectiveServices(
  survey: DraftSurvey,
  names: readonly string[],
): string[] {
  if (survey.allServices) return [...names];
  return survey.services.filter((service) => service.trim() !== "");
}

/** The value of the "All services" box in the Services checkbox group. */
export const ALL_SERVICES_OPTION = "all";

/**
 * The ticked values of the Services checkbox group for `survey`, whose boxes
 * are `names`: the names it lists, or every name and "All services" as well
 * when the survey is for all.
 */
export function serviceSelection(
  survey: DraftSurvey,
  names: readonly string[],
): string[] {
  if (survey.allServices) return [ALL_SERVICES_OPTION, ...names];
  return names.filter((name) => survey.services.includes(name));
}

/**
 * The survey's services after the Services checkbox group, whose boxes are
 * `names`, changes to `values`. "All services" is a select-all: ticking it
 * ticks every name and unticking it clears them, and it follows the others,
 * on once every name is ticked and off as soon as one is not. Names outside
 * the known four belong to the survey's own text fields: a select-all change
 * keeps them, and only unticking one by hand drops it.
 */
export function applyServiceSelection(
  survey: DraftSurvey,
  values: string[],
  names: readonly string[],
): Pick<DraftSurvey, "allServices" | "services"> {
  const allToggled =
    values.includes(ALL_SERVICES_OPTION) !== survey.allServices;
  const ticked = allToggled
    ? survey.allServices
      ? []
      : [...names]
    : names.filter((name) => values.includes(name));
  const own = survey.services.filter(
    (service) =>
      !isKnownService(service) &&
      (allToggled || !names.includes(service) || ticked.includes(service)),
  );
  return {
    allServices: names.every((name) => ticked.includes(name)),
    services: [...ticked.filter((name) => !own.includes(name)), ...own],
  };
}

/**
 * Gives each draft survey the `liveId` of the live survey with the same id,
 * so a later id change is noticed. Surveys with no live match lose theirs.
 */
export function linkToLive(draft: Draft, live: Draft | null): Draft {
  const liveIds = new Set(live?.surveys.map((survey) => survey.id) ?? []);
  return {
    ...draft,
    surveys: draft.surveys.map((survey) => ({
      ...survey,
      liveId: liveIds.has(survey.id) ? survey.id : undefined,
    })),
  };
}

/**
 * Carries the editor-only `key` and `liveId` from `previous` onto a draft
 * freshly read from edited JSON text: a survey takes them from the previous
 * survey with the same id, or else from the one at the same position when
 * that one's id is gone (its id was edited in place).
 */
export function carryOver(previous: Draft, next: Draft): Draft {
  const nextIds = new Set(next.surveys.map((survey) => survey.id));
  const used = new Set<DraftSurvey>();
  const surveys = next.surveys.map((survey, index) => {
    const sameId = previous.surveys.find(
      (old) => old.id === survey.id && !used.has(old),
    );
    const samePlace = previous.surveys[index];
    const match =
      sameId ??
      (samePlace && !nextIds.has(samePlace.id) && !used.has(samePlace)
        ? samePlace
        : undefined);
    if (!match) return survey;
    used.add(match);
    return { ...survey, key: match.key, liveId: match.liveId };
  });
  return { ...next, surveys };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}
