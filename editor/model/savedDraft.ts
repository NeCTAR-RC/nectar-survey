/**
 * The draft kept in `localStorage` between visits, so closing the tab loses
 * nothing. Rebuilt through `fromJson` on the way back, so a damaged or
 * outdated entry can never reach the form.
 */

import { isRecord, type Draft } from "./draft.ts";
import { fromJson } from "./json.ts";

/** `localStorage` key of the saved draft. Never a `nectar-survey:` key. */
export const DRAFT_STORAGE_KEY = "nectar-survey-editor:draft";

/** Where the current draft came from, for the status line. */
export interface DraftSource {
  kind: "none" | "live" | "template" | "file" | "paste" | "restored";
  /** File name for "file". */
  label?: string;
  /** ISO time of the load. */
  at: string;
}

/** What the editor keeps in `localStorage` between visits. */
export interface StoredDraft {
  version: 1;
  savedAt: string;
  /** The draft as `toJson` writes it. */
  json: string;
  /** Raw JSON text that did not parse yet, kept so it is not lost. */
  rawText?: string;
  /** `liveId` of each survey in `json`, by position. */
  liveIds: (string | null)[];
  /** The text last loaded or downloaded, to tell whether there are changes. */
  baseline: string;
  source: DraftSource;
}

/** Saves the draft; returns false when storage is unavailable or full. */
export function saveDraft(storage: Storage, stored: StoredDraft): boolean {
  try {
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

/** Removes the saved draft. Does nothing when storage fails. */
export function clearDraft(storage: Storage): void {
  try {
    storage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * The saved draft, rebuilt through `fromJson` so a damaged or outdated entry
 * can never reach the form. Returns null when there is none or it does not
 * read back.
 */
export function loadDraft(
  storage: Storage,
): { stored: StoredDraft; draft: Draft } | null {
  let value: unknown;
  try {
    const raw = storage.getItem(DRAFT_STORAGE_KEY);
    if (raw === null) return null;
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isStoredDraft(value)) return null;
  const result = fromJson(value.json);
  if (!result.ok) return null;
  const draft: Draft = {
    ...result.draft,
    surveys: result.draft.surveys.map((survey, index) => {
      const liveId = value.liveIds[index];
      return typeof liveId === "string" ? { ...survey, liveId } : survey;
    }),
  };
  return { stored: value, draft };
}

function isStoredDraft(value: unknown): value is StoredDraft {
  if (!isRecord(value) || value.version !== 1) return false;
  const source = value.source;
  return (
    typeof value.json === "string" &&
    typeof value.savedAt === "string" &&
    typeof value.baseline === "string" &&
    (value.rawText === undefined || typeof value.rawText === "string") &&
    Array.isArray(value.liveIds) &&
    value.liveIds.every((id) => id === null || typeof id === "string") &&
    isRecord(source) &&
    typeof source.kind === "string" &&
    SOURCE_KINDS.includes(source.kind) &&
    (source.label === undefined || typeof source.label === "string") &&
    typeof source.at === "string"
  );
}

const SOURCE_KINDS: readonly string[] = [
  "none",
  "live",
  "template",
  "file",
  "paste",
  "restored",
] satisfies DraftSource["kind"][];
