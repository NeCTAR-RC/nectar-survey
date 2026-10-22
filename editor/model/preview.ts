/**
 * What the preview shows: the config it mounts, the popup's verdict on each
 * survey worked out with the popup's own rules, a body paragraph exactly as
 * the popup renders it, and the link that opens a service page in preview
 * mode.
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
import {
  isRecord,
  type Draft,
  type DraftSurvey,
  type JsonValue,
  type KNOWN_SERVICES,
} from "./draft.ts";
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
  "preview-mode":
    "not a preview survey, so not shown on pages opened with ?nectar-survey=preview",
  preview: "preview only, shown on pages opened with ?nectar-survey=preview",
  draft: "a draft, not live",
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
 * The config the preview mounts. With `asIfLive`, every survey that is not
 * archived is live and one without a usable shared link gets a sample one,
 * so a draft can be previewed before the real links exist; per-service links
 * are kept, and archived surveys stay out of play as they are for users. The
 * editor page is not in preview mode, so a preview survey shows here only
 * when it is treated as live.
 */
export function previewConfig(
  draft: Draft,
  asIfLive: boolean,
): Record<string, JsonValue> {
  if (!asIfLive) return toConfigObject(draft);
  return toConfigObject({
    ...draft,
    surveys: draft.surveys.map((survey): DraftSurvey => ({
      ...survey,
      status: survey.status === "archived" ? "archived" : "live",
      url: isUsableUrl(survey.url) ? survey.url : SAMPLE_SURVEY_URL,
    })),
  });
}

/** Link the preview uses for surveys that have none yet. */
export const SAMPLE_SURVEY_URL = "https://example.org/sample-survey";

/**
 * The home page of each known service, the page "Try it on a service" opens
 * unless another address is given.
 */
export const SERVICE_PAGES: Record<(typeof KNOWN_SERVICES)[number], string> = {
  "Nectar Dashboard": "https://dashboard.rc.nectar.org.au/dashboard_home/",
  "ARDC Jupyter Notebook Service":
    "https://jupyterhub.rc.nectar.org.au/hub/home",
  "ARDC BinderHub Service": "https://binderhub.rc.nectar.org.au/",
  "ARDC Virtual Desktop Service": "https://desktop.rc.nectar.org.au/",
};

/** The query parameters of preview mode, as the popup reads them. */
const PREVIEW_PARAM = "nectar-survey";
const PREVIEW_NOW_PARAM = "nectar-survey-now";

/**
 * `address` with `nectar-survey=preview` added to its query, and with
 * `nectar-survey-now=<now>` too when `now` ("YYYY-MM-DDTHH:mm") is not empty.
 * The rest of the query and the fragment stay exactly as they were; preview
 * parameters already in the address are replaced, so a generated link can be
 * pasted back in. Undefined when `address` is not an http(s) address.
 */
export function previewLink(address: string, now: string): string | undefined {
  if (!isUsableUrl(address)) return undefined;
  const url = new URL(address.trim());
  const kept = url.search
    .slice(1)
    .split("&")
    .filter((pair) => {
      const key = pair.split("=", 1)[0];
      return pair !== "" && key !== PREVIEW_PARAM && key !== PREVIEW_NOW_PARAM;
    });
  const added = [`${PREVIEW_PARAM}=preview`];
  if (now !== "") added.push(`${PREVIEW_NOW_PARAM}=${now}`);
  url.search = [...kept, ...added].join("&");
  return url.href;
}
