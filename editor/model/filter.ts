/**
 * The survey list's search and filters. Each filter group narrows the list
 * on its own and the groups combine (all must match); an unset group means
 * "any", except Status, where unset means "any but archived". The UI holds
 * the filter; this module only answers which surveys match it.
 */

import type { SurveyStatus } from "../../src/config/config.ts";
import type { Draft, DraftSurvey } from "./draft.ts";
import type { SurveyTiming, Validation } from "./validate.ts";

/** What the survey list is narrowed to. */
export interface SurveyFilter {
  /** Text to find in the id or the title, ignoring case; blank finds all. */
  search: string;
  dates?: SurveyTiming;
  /**
   * One status, or unset for every survey that is not archived: archived
   * surveys are kept for the record and listed only when asked for.
   */
  status?: SurveyStatus;
  /** A service name the survey must list. */
  service?: string;
}

/**
 * The list as it first opens: every survey but the archived ones, nothing
 * searched.
 */
export const DEFAULT_FILTER: SurveyFilter = { search: "" };

/**
 * The groups set by the "Would show now" preset: the surveys the popup would
 * show at this moment, open now and live. Preview surveys are left out:
 * users never see them.
 */
export const SHOWING_NOW: Pick<SurveyFilter, "dates" | "status"> = {
  dates: "open",
  status: "live",
};

/** True when the Dates and Status groups equal `SHOWING_NOW`. */
export function isShowingNow(filter: SurveyFilter): boolean {
  return (
    filter.dates === SHOWING_NOW.dates && filter.status === SHOWING_NOW.status
  );
}

/**
 * `filter` with the preset turned on (its two groups set to `SHOWING_NOW`)
 * or off (both groups cleared). Search and service stay.
 */
export function withShowingNow(
  filter: SurveyFilter,
  on: boolean,
): SurveyFilter {
  if (on) return { ...filter, ...SHOWING_NOW };
  return { ...filter, dates: undefined, status: undefined };
}

/** True when the filter differs from the default or searches for something. */
export function isFilterActive(filter: SurveyFilter): boolean {
  return (
    filter.search.trim() !== "" ||
    filter.dates !== DEFAULT_FILTER.dates ||
    filter.status !== DEFAULT_FILTER.status ||
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
  if (filter.status === undefined) {
    if (survey.status === "archived") return false;
  } else if (survey.status !== filter.status) {
    return false;
  }
  return (
    filter.service === undefined || survey.services.includes(filter.service)
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
