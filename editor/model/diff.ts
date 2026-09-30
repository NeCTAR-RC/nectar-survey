/**
 * The changes publishing a draft would make to the live file, as a plain
 * list of added and removed surveys and changed fields.
 */

import {
  isRecord,
  type Draft,
  type DraftSurvey,
  type JsonValue,
} from "./draft.ts";
import { toSurveyObject } from "./json.ts";

/** One changed field of a survey that exists both live and in the draft. */
export interface FieldChange {
  surveyId: string;
  field: string;
  /** The live value as text; empty when the field was not set. */
  from: string;
  /** The draft value as text; empty when the field is not set. */
  to: string;
}

export interface DraftDiff {
  /** Ids of draft surveys that are not in the live file. */
  added: string[];
  /** Ids of live surveys that are not in the draft. */
  removed: string[];
  changes: FieldChange[];
}

/**
 * The changes publishing `draft` would make to `live`. A draft survey is
 * matched to the live survey it was loaded from (`liveId`), else to the live
 * survey with the same id. Values are shown as text: lists joined with
 * commas, one entry per paragraph and per service link.
 */
export function diff(live: Draft | null, draft: Draft): DraftDiff {
  const liveSurveys = live?.surveys ?? [];
  const matched = new Set<DraftSurvey>();
  const added: string[] = [];
  const changes: FieldChange[] = [];

  draft.surveys.forEach((survey, index) => {
    const match =
      liveSurveys.find((old) => old.id === (survey.liveId ?? survey.id)) ??
      liveSurveys.find((old) => old.id === survey.id);
    if (!match || matched.has(match)) {
      added.push(survey.id);
      return;
    }
    matched.add(match);
    const from = displayFields(match);
    const to = displayFields(survey);
    const liveIndex = liveSurveys.indexOf(match);
    if (liveIndex !== index) {
      from.set("position", String(liveIndex + 1));
      to.set("position", String(index + 1));
    }
    for (const field of new Set([...from.keys(), ...to.keys()])) {
      const before = from.get(field) ?? "";
      const after = to.get(field) ?? "";
      if (before !== after) {
        changes.push({ surveyId: match.id, field, from: before, to: after });
      }
    }
  });

  const removed = liveSurveys
    .filter((survey) => !matched.has(survey))
    .map((survey) => survey.id);

  const liveExtra = live?.extra ?? {};
  for (const key of new Set([
    ...Object.keys(liveExtra),
    ...Object.keys(draft.extra),
  ])) {
    const before = displayValue(liveExtra[key]);
    const after = displayValue(draft.extra[key]);
    if (before !== after) {
      changes.push({ surveyId: "", field: key, from: before, to: after });
    }
  }
  return { added, removed, changes };
}

/** A survey's fields as display text, keyed by the name the diff shows. */
function displayFields(survey: DraftSurvey): Map<string, string> {
  const fields = new Map<string, string>();
  for (const [key, value] of Object.entries(toSurveyObject(survey))) {
    if (key === "body" && Array.isArray(value)) {
      value.forEach((paragraph, index) =>
        fields.set(`body paragraph ${index + 1}`, displayValue(paragraph)),
      );
    } else if (key === "urls" && isRecord(value)) {
      for (const [service, url] of Object.entries(value)) {
        fields.set(`link for ${service}`, displayValue(url));
      }
    } else {
      fields.set(key, displayValue(value));
    }
  }
  return fields;
}

function displayValue(value: JsonValue | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value.join(", ");
  }
  return JSON.stringify(value);
}
