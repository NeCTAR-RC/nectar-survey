/**
 * The survey list's search and filters. Each filter group narrows the list
 * on its own and the groups combine (all must match); an unset group means
 * "any". The UI holds the filter; this module only answers which surveys
 * match it.
 */

import type { Draft, DraftSurvey } from "./draft.ts";
import type { SurveyTiming, Validation } from "./validate.ts";

/** What the survey list is narrowed to. */
export interface SurveyFilter {
  /** Text to find in the id or the title, ignoring case; blank finds all. */
  search: string;
  dates?: SurveyTiming;
  status?: "enabled" | "disabled";
  archive?: "current" | "archived";
  /** A service name; a survey for all services matches every one. */
  service?: string;
}

/** The list as it first opens: current surveys only, nothing searched. */
export const DEFAULT_FILTER: SurveyFilter = { search: "", archive: "current" };

/**
 * The groups set by the "Would show now" preset: the surveys the popup would
 * show at this moment, open now, enabled and not archived.
 */
export const SHOWING_NOW: Pick<SurveyFilter, "dates" | "status" | "archive"> = {
  dates: "open",
  status: "enabled",
  archive: "current",
};

/** True when the Dates, Status and Archive groups equal `SHOWING_NOW`. */
export function isShowingNow(filter: SurveyFilter): boolean {
  return (
    filter.dates === SHOWING_NOW.dates &&
    filter.status === SHOWING_NOW.status &&
    filter.archive === SHOWING_NOW.archive
  );
}

/**
 * `filter` with the preset turned on (its three groups set to `SHOWING_NOW`)
 * or off (the three groups cleared to "any"). Search and service stay.
 */
export function withShowingNow(
  filter: SurveyFilter,
  on: boolean,
): SurveyFilter {
  if (on) return { ...filter, ...SHOWING_NOW };
  return { ...filter, dates: undefined, status: undefined, archive: undefined };
}

/** True when the filter differs from the default or searches for something. */
export function isFilterActive(filter: SurveyFilter): boolean {
  return (
    filter.search.trim() !== "" ||
    filter.dates !== DEFAULT_FILTER.dates ||
    filter.status !== DEFAULT_FILTER.status ||
    filter.archive !== DEFAULT_FILTER.archive ||
    filter.service !== DEFAULT_FILTER.service
  );
}

/**
 * True when `survey` passes every group of `filter`. `timing` is the
 * survey's entry in `Validation.timing`; a survey whose dates do not read
 * has none, so it matches no Dates choice.
 */
export function matchesFilter(
  survey: DraftSurvey,
  timing: SurveyTiming | undefined,
  filter: SurveyFilter,
): boolean {
  const search = filter.search.trim().toLowerCase();
  if (
    search !== "" &&
    !survey.id.toLowerCase().includes(search) &&
    !survey.title.toLowerCase().includes(search)
  ) {
    return false;
  }
  if (filter.dates !== undefined && timing !== filter.dates) return false;
  if (
    filter.status !== undefined &&
    survey.enabled !== (filter.status === "enabled")
  ) {
    return false;
  }
  if (
    filter.archive !== undefined &&
    survey.archived !== (filter.archive === "archived")
  ) {
    return false;
  }
  // "all" matches any name a host sends, a learned one too.
  return (
    filter.service === undefined ||
    survey.allServices ||
    survey.services.includes(filter.service)
  );
}

/** The indices of the surveys that match `filter`, in file order. */
export function filterSurveys(
  draft: Draft,
  validation: Validation,
  filter: SurveyFilter,
): number[] {
  return draft.surveys.flatMap((survey, index) =>
    matchesFilter(survey, validation.timing[index], filter) ? [index] : [],
  );
}
