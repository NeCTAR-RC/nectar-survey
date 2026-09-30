/**
 * The editor's state and every change to it, as a pure reducer. The form, the
 * raw JSON tab and the loaders all dispatch actions here, so the two views of
 * the draft can never drift apart.
 */

import {
  carryOver,
  duplicateSurvey,
  emptyDraft,
  fromJson,
  linkToLive,
  newSurvey,
  toJson,
  type Draft,
  type DraftSource,
  type DraftSurvey,
  type JsonProblem,
  type StoredDraft,
} from "./model/index.ts";

/** What is known about the published `surveys.json`. */
export type LiveState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "failed"; message: string }
  | { status: "invalid"; problem: JsonProblem }
  | { status: "loaded"; draft: Draft; at: string };

/** The outcome of one request for the live file. */
export type LiveFetch =
  | { status: "missing" }
  | { status: "failed"; message: string }
  | { status: "found"; text: string; at: string };

export interface EditorState {
  draft: Draft;
  /** The raw JSON tab's text; equals `toJson(draft)` unless edited there. */
  rawText: string;
  /** Set while `rawText` does not read as a config; the form is paused. */
  rawProblem: JsonProblem | null;
  source: DraftSource;
  /** Text last loaded or downloaded; differences count as unsaved work. */
  baseline: string;
  live: LiveState;
  /**
   * The `key` of the survey whose form is shown, or null when there are no
   * surveys. Never saved between visits.
   */
  selectedKey: string | null;
}

export type EditorAction =
  | { type: "load"; text: string; source: DraftSource }
  | { type: "live-result"; result: LiveFetch; adopt: "always" | "if-empty" }
  | { type: "live-loading" }
  | { type: "update-survey"; index: number; patch: Partial<DraftSurvey> }
  | { type: "add-survey" }
  | { type: "duplicate-survey"; index: number }
  | { type: "remove-survey"; index: number }
  | { type: "remove-surveys"; indices: number[] }
  | { type: "move-survey"; index: number; offset: -1 | 1 }
  | { type: "edit-raw"; text: string }
  | { type: "select-survey"; key: string }
  | { type: "downloaded" };

/**
 * The state a page load starts from: the saved draft when there is one,
 * otherwise an empty draft waiting for the live file.
 */
export function initialState(
  restored: { stored: StoredDraft; draft: Draft } | null,
  now: string,
): EditorState {
  if (!restored) {
    const draft = emptyDraft();
    return {
      draft,
      rawText: toJson(draft),
      rawProblem: null,
      source: { kind: "none", at: now },
      baseline: toJson(draft),
      live: { status: "loading" },
      selectedKey: null,
    };
  }
  const { stored, draft } = restored;
  const raw =
    stored.rawText === undefined ? undefined : fromJson(stored.rawText);
  return {
    draft,
    rawText: stored.rawText ?? toJson(draft),
    rawProblem: raw && !raw.ok ? raw.problem : null,
    source: { kind: "restored", at: stored.savedAt },
    baseline: stored.baseline,
    live: { status: "loading" },
    selectedKey: firstKey(draft),
  };
}

/** True when the draft differs from what was last loaded or downloaded. */
export function hasUnsavedChanges(state: EditorState): boolean {
  return currentText(state) !== state.baseline;
}

/** The text a download would contain, or the raw text while it is broken. */
export function currentText(state: EditorState): string {
  return state.rawProblem ? state.rawText : toJson(state.draft);
}

/** The state as it is saved between visits. */
export function toStoredDraft(state: EditorState, now: string): StoredDraft {
  return {
    version: 1,
    savedAt: now,
    json: toJson(state.draft),
    rawText: state.rawProblem ? state.rawText : undefined,
    liveIds: state.draft.surveys.map((survey) => survey.liveId ?? null),
    baseline: state.baseline,
    source: state.source,
  };
}

/** The live draft, when the live file has been read. */
export function liveDraft(state: EditorState): Draft | null {
  return state.live.status === "loaded" ? state.live.draft : null;
}

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "load":
      return loadText(state, action.text, action.source);

    case "live-loading":
      return { ...state, live: { status: "loading" } };

    case "live-result":
      return applyLive(state, action.result, action.adopt);

    case "update-survey":
      return withDraft(state, {
        ...state.draft,
        surveys: state.draft.surveys.map((survey, index) =>
          index === action.index ? { ...survey, ...action.patch } : survey,
        ),
      });

    case "add-survey": {
      const added = newSurvey(state.draft.surveys.map((survey) => survey.id));
      return {
        ...withDraft(state, {
          ...state.draft,
          surveys: [...state.draft.surveys, added],
        }),
        selectedKey: added.key,
      };
    }

    case "duplicate-survey": {
      const copy = duplicateSurvey(state.draft.surveys[action.index]);
      const surveys = [...state.draft.surveys];
      surveys.splice(action.index + 1, 0, copy);
      return {
        ...withDraft(state, { ...state.draft, surveys }),
        selectedKey: copy.key,
      };
    }

    case "remove-survey":
      return removeSurveys(state, new Set([action.index]));

    case "remove-surveys":
      return removeSurveys(state, new Set(action.indices));

    case "move-survey": {
      const target = action.index + action.offset;
      if (target < 0 || target >= state.draft.surveys.length) return state;
      const surveys = [...state.draft.surveys];
      [surveys[action.index], surveys[target]] = [
        surveys[target],
        surveys[action.index],
      ];
      return withDraft(state, { ...state.draft, surveys });
    }

    case "edit-raw": {
      const result = fromJson(action.text);
      if (!result.ok) {
        return { ...state, rawText: action.text, rawProblem: result.problem };
      }
      const draft = carryOver(state.draft, result.draft);
      const kept = draft.surveys.some(
        (survey) => survey.key === state.selectedKey,
      );
      return {
        ...state,
        draft,
        rawText: action.text,
        rawProblem: null,
        selectedKey: kept ? state.selectedKey : firstKey(draft),
      };
    }

    case "select-survey":
      return { ...state, selectedKey: action.key };

    case "downloaded":
      return { ...state, baseline: toJson(state.draft) };
  }
}

/** A form change: the raw JSON follows the draft. */
function withDraft(state: EditorState, draft: Draft): EditorState {
  return { ...state, draft, rawText: toJson(draft), rawProblem: null };
}

/** The key of the draft's first survey, or null when it has none. */
function firstKey(draft: Draft): string | null {
  return draft.surveys[0]?.key ?? null;
}

/**
 * Removes the surveys at `gone`. A removed selection passes to the next
 * survey that stays, in file order, else to the last one, else to nothing;
 * a selection that stays is kept.
 */
function removeSurveys(state: EditorState, gone: Set<number>): EditorState {
  const { surveys } = state.draft;
  const remaining = surveys.filter((_, index) => !gone.has(index));
  const selectedIndex = surveys.findIndex(
    (survey) => survey.key === state.selectedKey,
  );
  let selectedKey = state.selectedKey;
  if (gone.has(selectedIndex)) {
    const next = surveys.find(
      (_, index) => index > selectedIndex && !gone.has(index),
    );
    selectedKey = (next ?? remaining.at(-1))?.key ?? null;
  }
  return {
    ...withDraft(state, { ...state.draft, surveys: remaining }),
    selectedKey,
  };
}

/**
 * Replaces the draft with `text` and selects its first survey. Text that does
 * not read as a config goes to the raw JSON tab with its problem, so it can
 * be fixed there.
 */
function loadText(
  state: EditorState,
  text: string,
  source: DraftSource,
): EditorState {
  const result = fromJson(text);
  if (!result.ok) {
    return {
      ...state,
      draft: emptyDraft(),
      rawText: text,
      rawProblem: result.problem,
      source,
      baseline: text,
      selectedKey: null,
    };
  }
  const draft = linkToLive(result.draft, liveDraft(state));
  const json = toJson(draft);
  return {
    ...state,
    draft,
    rawText: json,
    rawProblem: null,
    source,
    baseline: json,
    selectedKey: firstKey(draft),
  };
}

/**
 * Records the live file. With `adopt: "always"` (a load the user asked for) it also
 * becomes the draft; with "if-empty" (the automatic request on page load) only
 * while nothing else has been loaded, so a slow answer never replaces work.
 */
function applyLive(
  state: EditorState,
  result: LiveFetch,
  adopt: "always" | "if-empty",
): EditorState {
  const shouldAdopt = adopt === "always" || state.source.kind === "none";
  if (result.status !== "found") {
    return { ...state, live: result };
  }
  const source: DraftSource = { kind: "live", at: result.at };
  const parsed = fromJson(result.text);
  if (!parsed.ok) {
    const next: EditorState = {
      ...state,
      live: { status: "invalid", problem: parsed.problem },
    };
    return shouldAdopt ? loadText(next, result.text, source) : next;
  }
  const next: EditorState = {
    ...state,
    live: { status: "loaded", draft: parsed.draft, at: result.at },
  };
  if (shouldAdopt) return loadText(next, result.text, source);
  // A draft loaded from elsewhere before the live file arrived gets linked
  // now; a restored draft keeps the links it was saved with.
  if (state.source.kind === "restored") return next;
  return { ...next, draft: linkToLive(state.draft, parsed.draft) };
}
