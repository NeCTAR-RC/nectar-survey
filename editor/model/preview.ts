/**
 * What the preview shows: the config it mounts, the popup's verdict on each
 * survey worked out with the popup's own rules, and a body paragraph exactly
 * as the popup renders it.
 */

import {
  parseConfig,
  renderText,
  sanitiseHtml,
} from "../../src/config/config.ts";
import {
  skipReason,
  type RuleContext,
  type SkipReason,
} from "../../src/config/rules.ts";
import { isRecord, type Draft, type JsonValue } from "./draft.ts";
import { toConfigObject } from "./json.ts";
import { isUsableUrl } from "./validate.ts";

/**
 * A body paragraph exactly as the popup shows it on `service`: sanitised,
 * with `{service}` filled in. Safe to assign to `innerHTML`.
 */
export function renderParagraph(paragraph: string, service: string): string {
  return renderText(sanitiseHtml(paragraph), service);
}

/** Why the preview shows or skips each survey, in config order. */
export interface PreviewOutcome {
  /** Id of the survey the popup opens, if any. */
  shownId?: string;
  skipped: { id: string; reason: string }[];
}

const SKIP_REASONS: Record<SkipReason, string> = {
  archived: "archived",
  disabled: "not enabled",
  closed: "not open on this date",
  service: "not for this service",
  "no-url": "no survey link for this service",
  dismissed: "dismissed in this browser",
  clicked: "already started in this browser",
  "shown-today": "already shown today in this browser",
};

/**
 * What the popup does with `config` on `service` at `now`, using the popup's
 * own rules and the given saved state. Surveys the popup cannot read are
 * reported as having errors.
 */
export function previewOutcome(
  config: Record<string, JsonValue>,
  context: RuleContext,
): PreviewOutcome {
  const readable = parseConfig(config);
  const listed = Array.isArray(config.surveys) ? config.surveys : [];
  const outcome: PreviewOutcome = { skipped: [] };
  let next = 0;
  for (const entry of listed) {
    const id = isRecord(entry) && typeof entry.id === "string" ? entry.id : "";
    const survey = readable[next];
    if (!survey || survey.id !== id) {
      outcome.skipped.push({ id, reason: "has errors" });
      continue;
    }
    next += 1;
    const reason = skipReason(survey, context);
    if (reason !== undefined) {
      outcome.skipped.push({ id, reason: SKIP_REASONS[reason] });
    } else if (outcome.shownId === undefined) {
      outcome.shownId = id;
    } else {
      outcome.skipped.push({
        id,
        reason: "another survey is shown first",
      });
    }
  }
  return outcome;
}

/**
 * The config the preview mounts. With `asIfLive`, every survey is enabled and
 * one without a usable shared link gets a sample one, so a draft can be
 * previewed before the real links exist; per-service links are kept.
 */
export function previewConfig(
  draft: Draft,
  asIfLive: boolean,
): Record<string, JsonValue> {
  if (!asIfLive) return toConfigObject(draft);
  return toConfigObject({
    ...draft,
    surveys: draft.surveys.map((survey) => ({
      ...survey,
      enabled: true,
      url: isUsableUrl(survey.url) ? survey.url : SAMPLE_SURVEY_URL,
    })),
  });
}

/** Link the preview uses for surveys that have none yet. */
export const SAMPLE_SURVEY_URL = "https://example.org/sample-survey";
