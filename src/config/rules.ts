/**
 * Display rules: which survey, if any, the popup shows on this page load.
 * Pure functions; the caller passes in the service, the time, the page's
 * preview mode and a state reader, so the rules are easy to test.
 */

import { resolveSurveyUrl, servicesMatch, type Survey } from "./config.ts";
import { calendarDay, isOpen } from "./dates.ts";
import type { SurveyState } from "./storage.ts";

/** Everything the rules need to know about the current page load. */
export interface RuleContext {
  /** The host's `service` attribute. */
  service: string;
  now: Date;
  /**
   * This page load is in preview mode (its address carries
   * `?nectar-survey=preview`), so preview surveys show and no other survey
   * does.
   */
  preview: boolean;
  /** Stored state of a survey by id (usually `storage.readState`). */
  readState: (id: string) => SurveyState;
}

export type SkipReason =
  | "archived"
  | "preview-mode"
  | "preview"
  | "draft"
  | "closed"
  | "service"
  | "no-url"
  | "dismissed"
  | "clicked"
  | "shown-today";

/**
 * Returns why `survey` would not be shown right now, or undefined when it
 * should be shown. Checks run in this order and the first failing one is
 * returned: archived, not a preview survey while in preview mode, a preview
 * survey outside preview mode, not live (a draft), outside its dates, not
 * for this service, no usable url for this service, dismissed, clicked
 * (approach 1: a click counts as done), already shown today in the survey's
 * time zone. Only this survey's own stored state is read.
 *
 * In preview mode only preview surveys are considered, so a pretend time
 * (`ctx.now`) can only ever reach them. A preview survey there obeys every
 * rule up to the url, so the tester sees what users will see once it is
 * live, but its stored state is never read: it shows on every page load,
 * however often the tester closes it. The element never writes it either,
 * so a preview page leaves nothing stored.
 */
export function skipReason(
  survey: Survey,
  ctx: RuleContext,
): SkipReason | undefined {
  if (survey.status === "archived") return "archived";
  const isPreview = survey.status === "preview";
  if (ctx.preview && !isPreview) return "preview-mode";
  if (isPreview && !ctx.preview) return "preview";
  if (!isPreview && survey.status !== "live") return "draft";
  if (!isOpen(survey, ctx.now)) return "closed";
  if (!servicesMatch(survey, ctx.service)) return "service";
  if (resolveSurveyUrl(survey, ctx.service) === undefined) return "no-url";
  if (isPreview) return undefined;
  const state = ctx.readState(survey.id);
  if (state.dismissed) return "dismissed";
  if (state.clicked) return "clicked";
  if (state.shownOn === calendarDay(ctx.now, survey.timezone)) {
    return "shown-today";
  }
  return undefined;
}

/**
 * Returns the survey that should be shown now, or undefined when none
 * should. The popup shows at most one survey per page load: the first
 * showable survey in config order. In preview mode only preview surveys can
 * be showable, so a survey under test appears even while a live survey is
 * open; outside preview mode preview surveys are all skipped, so live
 * surveys are chosen exactly as before.
 */
export function selectSurvey(
  surveys: Survey[],
  ctx: RuleContext,
): Survey | undefined {
  return surveys.find((survey) => skipReason(survey, ctx) === undefined);
}
