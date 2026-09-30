import { describe, expect, it } from "vitest";
import exampleJson from "../public/surveys.example.json?raw";
import { toJson } from "./model/index.ts";
import {
  currentText,
  editorReducer,
  hasUnsavedChanges,
  initialState,
  toStoredDraft,
  type EditorState,
} from "./state.ts";

const AT = "2026-10-01T10:00:00.000Z";

function fresh(): EditorState {
  return initialState(null, AT);
}

function withTemplate(): EditorState {
  return editorReducer(fresh(), {
    type: "load",
    text: exampleJson,
    source: { kind: "template", at: AT },
  });
}

describe("editorReducer", () => {
  it("loads a config into the form and the raw text, with no unsaved changes", () => {
    const state = withTemplate();
    expect(state.draft.surveys.map((s) => s.id)).toEqual(["nectar-2026"]);
    expect(state.rawText).toBe(toJson(state.draft));
    expect(state.rawProblem).toBeNull();
    expect(hasUnsavedChanges(state)).toBe(false);
  });

  it("sends text that does not parse to the raw tab and pauses the form", () => {
    const state = editorReducer(fresh(), {
      type: "load",
      text: '{"surveys": [}',
      source: { kind: "paste", at: AT },
    });
    expect(state.rawProblem?.line).toBe(1);
    expect(state.draft.surveys).toEqual([]);
    expect(currentText(state)).toBe('{"surveys": [}');
  });

  it("keeps the raw text in step with form edits", () => {
    const state = editorReducer(withTemplate(), {
      type: "update-survey",
      index: 0,
      patch: { title: "New title" },
    });
    expect(JSON.parse(state.rawText).surveys[0].title).toBe("New title");
    expect(hasUnsavedChanges(state)).toBe(true);
  });

  it("updates the form from valid raw text and keeps survey identity", () => {
    const before = withTemplate();
    const text = before.rawText.replace('"enabled": false', '"enabled": true');
    const state = editorReducer(before, { type: "edit-raw", text });
    expect(state.draft.surveys[0].enabled).toBe(true);
    expect(state.draft.surveys[0].key).toBe(before.draft.surveys[0].key);
    expect(state.rawText).toBe(text);
  });

  it("keeps the last good draft while the raw text is broken", () => {
    const before = withTemplate();
    const state = editorReducer(before, { type: "edit-raw", text: "{" });
    expect(state.rawProblem).not.toBeNull();
    expect(state.draft).toBe(before.draft);
  });

  it("adds, duplicates, moves and removes surveys", () => {
    let state = withTemplate();
    state = editorReducer(state, { type: "duplicate-survey", index: 0 });
    state = editorReducer(state, { type: "add-survey" });
    expect(state.draft.surveys.map((s) => s.id)).toEqual([
      "nectar-2026",
      "nectar-2026-copy",
      "survey-1",
    ]);
    state = editorReducer(state, { type: "move-survey", index: 2, offset: -1 });
    state = editorReducer(state, { type: "move-survey", index: 0, offset: -1 });
    state = editorReducer(state, { type: "remove-survey", index: 0 });
    expect(state.draft.surveys.map((s) => s.id)).toEqual([
      "survey-1",
      "nectar-2026-copy",
    ]);
  });

  it("suggests the lowest free survey-<n> id for a new survey", () => {
    let state = withTemplate();
    for (let i = 0; i < 5; i++) {
      state = editorReducer(state, { type: "add-survey" });
    }
    expect(state.draft.surveys.map((s) => s.id)).toEqual([
      "nectar-2026",
      "survey-1",
      "survey-2",
      "survey-3",
      "survey-4",
      "survey-5",
    ]);
    state = editorReducer(state, { type: "remove-survey", index: 3 });
    state = editorReducer(state, { type: "add-survey" });
    expect(state.draft.surveys.at(-1)?.id).toBe("survey-3");
  });

  it("archives and unarchives through the raw text", () => {
    let state = editorReducer(withTemplate(), {
      type: "update-survey",
      index: 0,
      patch: { archived: true },
    });
    expect(state.rawText).toMatch(/"enabled": false,\n\s+"archived": true,/);
    state = editorReducer(state, {
      type: "update-survey",
      index: 0,
      patch: { archived: false },
    });
    expect(state.rawText).not.toContain("archived");
  });

  it("removes several surveys at once by index", () => {
    let state = withTemplate();
    state = editorReducer(state, { type: "add-survey" });
    state = editorReducer(state, { type: "add-survey" });
    state = editorReducer(state, { type: "remove-surveys", indices: [0, 2] });
    expect(state.draft.surveys.map((s) => s.id)).toEqual(["survey-1"]);
  });

  it("clears unsaved changes on download", () => {
    const edited = editorReducer(withTemplate(), { type: "add-survey" });
    expect(hasUnsavedChanges(edited)).toBe(true);
    expect(
      hasUnsavedChanges(editorReducer(edited, { type: "downloaded" })),
    ).toBe(false);
  });
});

describe("the selected survey", () => {
  /** The template plus `count` added surveys, with nothing else changed. */
  function withSurveys(count: number): EditorState {
    let state = withTemplate();
    for (let i = 0; i < count; i++) {
      state = editorReducer(state, { type: "add-survey" });
    }
    return state;
  }

  const keyAt = (state: EditorState, index: number) =>
    state.draft.surveys[index].key;

  const select = (state: EditorState, index: number): EditorState =>
    editorReducer(state, { type: "select-survey", key: keyAt(state, index) });

  it("is the first survey after a load, and nothing for an empty or broken file", () => {
    const state = withTemplate();
    expect(state.selectedKey).toBe(keyAt(state, 0));
    expect(fresh().selectedKey).toBeNull();
    const broken = editorReducer(state, {
      type: "load",
      text: "{",
      source: { kind: "paste", at: AT },
    });
    expect(broken.selectedKey).toBeNull();
    const empty = editorReducer(state, {
      type: "load",
      text: '{ "surveys": [] }',
      source: { kind: "paste", at: AT },
    });
    expect(empty.selectedKey).toBeNull();
  });

  it("is the first survey of a live file that is adopted, and unchanged by one that is not", () => {
    const found = { status: "found", text: exampleJson, at: AT } as const;
    const adopted = editorReducer(fresh(), {
      type: "live-result",
      result: found,
      adopt: "if-empty",
    });
    expect(adopted.selectedKey).toBe(keyAt(adopted, 0));
    const before = select(withSurveys(1), 1);
    const linked = editorReducer(before, {
      type: "live-result",
      result: found,
      adopt: "if-empty",
    });
    expect(linked.selectedKey).toBe(keyAt(before, 1));
  });

  it("moves to a survey that is added or duplicated", () => {
    const added = withSurveys(1);
    expect(added.selectedKey).toBe(keyAt(added, 1));
    const copied = editorReducer(added, { type: "duplicate-survey", index: 0 });
    expect(copied.selectedKey).toBe(keyAt(copied, 1));
    expect(copied.draft.surveys[1].id).toBe("nectar-2026-copy");
  });

  it("selects a survey by key and stays on it through moves, edits and downloads", () => {
    let state = select(withSurveys(2), 0);
    const key = keyAt(state, 0);
    state = editorReducer(state, { type: "move-survey", index: 0, offset: 1 });
    state = editorReducer(state, {
      type: "update-survey",
      index: 1,
      patch: { title: "Moved" },
    });
    state = editorReducer(state, { type: "downloaded" });
    expect(state.selectedKey).toBe(key);
    expect(keyAt(state, 1)).toBe(key);
  });

  it("passes to the survey that takes the place of a removed one", () => {
    const state = select(withSurveys(2), 1);
    const removed = editorReducer(state, { type: "remove-survey", index: 1 });
    expect(removed.selectedKey).toBe(keyAt(state, 2));
  });

  it("passes to the last survey when the removed one was last, then to nothing", () => {
    let state = withSurveys(1);
    state = editorReducer(state, { type: "remove-survey", index: 1 });
    expect(state.selectedKey).toBe(keyAt(state, 0));
    state = editorReducer(state, { type: "remove-survey", index: 0 });
    expect(state.selectedKey).toBeNull();
  });

  it("stays on a survey that is not removed", () => {
    const state = select(withSurveys(2), 2);
    const removed = editorReducer(state, { type: "remove-survey", index: 0 });
    expect(removed.selectedKey).toBe(keyAt(state, 2));
  });

  it("passes to the next survey that stays when several are removed", () => {
    const state = select(withSurveys(3), 1);
    const removed = editorReducer(state, {
      type: "remove-surveys",
      indices: [1, 2],
    });
    expect(removed.selectedKey).toBe(keyAt(state, 3));
    const allButFirst = editorReducer(state, {
      type: "remove-surveys",
      indices: [1, 2, 3],
    });
    expect(allButFirst.selectedKey).toBe(keyAt(state, 0));
  });

  it("keeps the survey through a raw edit while it keeps its identity", () => {
    const state = select(withSurveys(1), 1);
    const text = state.rawText.replace('"enabled": false', '"enabled": true');
    const edited = editorReducer(state, { type: "edit-raw", text });
    expect(edited.selectedKey).toBe(keyAt(state, 1));
    const broken = editorReducer(state, { type: "edit-raw", text: "{" });
    expect(broken.selectedKey).toBe(keyAt(state, 1));
  });

  it("falls back to the first survey when a raw edit drops the selected one", () => {
    const state = select(withSurveys(1), 1);
    const onlyFirst = JSON.stringify({
      surveys: [JSON.parse(state.rawText).surveys[0]],
    });
    const edited = editorReducer(state, { type: "edit-raw", text: onlyFirst });
    expect(edited.selectedKey).toBe(keyAt(state, 0));
    const none = editorReducer(state, {
      type: "edit-raw",
      text: '{ "surveys": [] }',
    });
    expect(none.selectedKey).toBeNull();
  });
});

describe("the live file", () => {
  const found = { status: "found", text: exampleJson, at: AT } as const;

  it("becomes the draft on page load when nothing else is loaded", () => {
    const state = editorReducer(fresh(), {
      type: "live-result",
      result: found,
      adopt: "if-empty",
    });
    expect(state.source.kind).toBe("live");
    expect(state.live.status).toBe("loaded");
    expect(state.draft.surveys[0].liveId).toBe("nectar-2026");
  });

  it("never replaces a draft loaded while it was on its way, but links it", () => {
    const state = editorReducer(withTemplate(), {
      type: "live-result",
      result: found,
      adopt: "if-empty",
    });
    expect(state.source.kind).toBe("template");
    expect(state.draft.surveys[0].liveId).toBe("nectar-2026");
  });

  it("records that nothing is published", () => {
    const state = editorReducer(fresh(), {
      type: "live-result",
      result: { status: "missing" },
      adopt: "always",
    });
    expect(state.live.status).toBe("missing");
    expect(state.draft.surveys).toEqual([]);
  });
});

describe("restoring", () => {
  it("brings back the draft, its raw text problem and its baseline", () => {
    const edited = editorReducer(withTemplate(), {
      type: "edit-raw",
      text: "{",
    });
    const stored = toStoredDraft(edited, AT);
    const restored = initialState(
      { stored, draft: edited.draft },
      "2026-10-02T00:00:00.000Z",
    );
    expect(restored.source).toEqual({ kind: "restored", at: AT });
    expect(restored.rawText).toBe("{");
    expect(restored.rawProblem).not.toBeNull();
    expect(hasUnsavedChanges(restored)).toBe(true);
  });

  it("selects the first survey, not the one selected before the visit", () => {
    let edited = editorReducer(withTemplate(), { type: "add-survey" });
    edited = editorReducer(edited, { type: "add-survey" });
    const restored = initialState(
      { stored: toStoredDraft(edited, AT), draft: edited.draft },
      "2026-10-02T00:00:00.000Z",
    );
    expect(edited.selectedKey).toBe(edited.draft.surveys[2].key);
    expect(restored.selectedKey).toBe(edited.draft.surveys[0].key);
  });
});
