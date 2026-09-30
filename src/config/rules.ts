/**
 * Display rules: which survey, if any, the popup shows on this page load.
 * Pure functions; the caller passes in the service, the time and a state
 * reader, so the rules are easy to test.
 */

import { resolveSurveyUrl, servicesMatch, type Survey } from "./config.ts";
import { calendarDay, isOpen } from "./dates.ts";
import type { SurveyState } from "./storage.ts";

/** Everything the rules need to know about the current page load. */
export interface RuleContext {
  /** The host's `service` attribute. */
  service: string;
  now: Date;
  /** Stored state of a survey by id (usually `storage.readState`). */
  readState: (id: string) => SurveyState;
}

export type SkipReason =
  | "archived"
  | "disabled"
  | "closed"
  | "service"
  | "no-url"
  | "dismissed"
  | "clicked"
  | "shown-today";

/**
 * Returns why `survey` would not be shown right now, or undefined when it
 * should be shown. Checks run in this order and the first failing one is
 * returned: archived, not enabled, outside its dates, not for this service,
 * no usable url for this service, dismissed, clicked (approach 1: a click
 * counts as done), already shown today in the survey's time zone. Only this
 * survey's own stored state is read.
 */
export function skipReason(
  survey: Survey,
  ctx: RuleContext,
): SkipReason | undefined {
  if (survey.archived) return "archived";
  if (!survey.enabled) return "disabled";
  if (!isOpen(survey, ctx.now)) return "closed";
  if (!servicesMatch(survey, ctx.service)) return "service";
  if (resolveSurveyUrl(survey, ctx.service) === undefined) return "no-url";
  const state = ctx.readState(survey.id);
  if (state.dismissed) return "dismissed";
  if (state.clicked) return "clicked";
  if (state.shownOn === calendarDay(ctx.now, survey.timezone)) {
    return "shown-today";
  }
  return undefined;
}

/**
 * Returns the first survey, in config order, that should be shown now, or
 * undefined when none should. The popup shows at most one survey per page
 * load.
 */
export function selectSurvey(
  surveys: Survey[],
  ctx: RuleContext,
): Survey | undefined {
  return surveys.find((survey) => skipReason(survey, ctx) === undefined);
}
