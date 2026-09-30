import { TabItem, Tabs, ToastRegion, type Key } from "@ardc-ui/react";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { ChangesPanel } from "./components/ChangesPanel.tsx";
import { ConfirmDialog } from "./components/ConfirmDialog.tsx";
import { EditorHeader } from "./components/EditorHeader.tsx";
import type { LoadRoute } from "./components/loadRoutes.ts";
import { PasteDialog } from "./components/PasteDialog.tsx";
import { PreviewPanel } from "./components/PreviewPanel.tsx";
import { PublishPanel } from "./components/PublishPanel.tsx";
import { RawJsonPanel } from "./components/RawJsonPanel.tsx";
import { SelectedSurvey } from "./components/SelectedSurvey.tsx";
import { StartPanel } from "./components/StartPanel.tsx";
import { SurveyNav } from "./components/SurveyNav.tsx";
import { ValidationPanel } from "./components/ValidationPanel.tsx";
import {
  copyText,
  downloadText,
  DOWNLOAD_NAME,
  fetchLive,
  fetchTemplate,
  formatTime,
} from "./io.ts";
import {
  clearDraft,
  DEFAULT_FILTER,
  fieldDomId,
  fromJson,
  loadDraft,
  saveDraft,
  validate,
  type DraftSource,
  type SurveyFilter,
} from "./model/index.ts";
import { plural } from "./plural.ts";
import { focusField, revealTop } from "./scrollToForm.ts";
import {
  currentText,
  editorReducer,
  hasUnsavedChanges,
  initialState,
  toStoredDraft,
  type EditorState,
} from "./state.ts";
import { notify, toasts } from "./toasts.ts";
import { useHeightProperty } from "./useHeightProperty.ts";

/**
 * Width of the side panel's content, in pixels, below which the tabs become
 * stacked rows. The five titles need about 475px; between this and that the
 * library's strip scrolls with its arrow, which keeps tabs at laptop widths.
 */
const TABS_STACK_BELOW = 400;

/**
 * How long Copy JSON shows its copied glyph after a successful copy, in
 * milliseconds; the library's own copy control uses the same two seconds.
 */
const COPIED_DURATION = 2000;

/**
 * Where to take the reader once the form shows the survey: into a field
 * (`focus`), or to the top of the survey's card without moving focus. A new
 * object for every request, so the same target can be asked for twice.
 */
interface FormTarget {
  domId: string;
  focus: boolean;
}

/** `localStorage`, or null where the browser blocks it. */
function draftStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The config editor: loads a `surveys.json`, edits it in a form or as raw
 * JSON, checks it with the popup's own rules, previews the real popup and
 * downloads the result. The draft is kept in this browser until it is
 * downloaded, so closing the tab loses nothing.
 */
export function App() {
  const storage = draftStorage();
  const [state, dispatch] = useReducer(editorReducer, null, () =>
    initialState(storage ? loadDraft(storage) : null, new Date().toISOString()),
  );
  const [tab, setTab] = useState<Key>(() =>
    state.rawProblem ? "json" : "problems",
  );
  const [pendingLoad, setPendingLoad] = useState<(() => void) | null>(null);
  const [isPasting, setIsPasting] = useState(false);
  const [filter, setFilter] = useState<SurveyFilter>(DEFAULT_FILTER);
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useHeightProperty(headerRef, rootRef, "--editor-header-height");

  const validation = useMemo(() => validate(state.draft), [state.draft]);
  const unsaved = hasUnsavedChanges(state);
  const hasDraft = state.source.kind !== "none";
  const isPaused = state.rawProblem !== null;
  const selectedIndex = state.draft.surveys.findIndex(
    (survey) => survey.key === state.selectedKey,
  );
  const downloadBlockedBecause = state.rawProblem
    ? "Fix the text in the JSON tab first."
    : validation.errors.length > 0
      ? `Fix ${plural(validation.errors.length, "error")} first. The Problems tab lists them.`
      : undefined;

  useEffect(() => {
    if (!storage) return;
    if (hasUnsavedChanges(state)) {
      saveDraft(storage, toStoredDraft(state, new Date().toISOString()));
    } else {
      clearDraft(storage);
    }
  }, [state, storage]);

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  // Runs after the render that shows the requested survey, so its fields exist.
  useEffect(() => {
    if (!formTarget) return;
    if (formTarget.focus) focusField(formTarget.domId);
    else revealTop(formTarget.domId);
  }, [formTarget]);

  useEffect(() => {
    let current = true;
    void fetchLive().then((result) => {
      if (current) dispatch({ type: "live-result", result, adopt: "if-empty" });
    });
    return () => {
      current = false;
    };
  }, []);

  /** Runs `load` now, or after a confirmation when it would replace work. */
  const replaceDraft = (load: () => void): void => {
    if (unsaved) setPendingLoad(() => load);
    else load();
  };

  const loadText = (text: string, source: Omit<DraftSource, "at">): void => {
    dispatch({
      type: "load",
      text,
      source: { ...source, at: new Date().toISOString() },
    });
    showRawIfBroken(text);
  };

  /** Text that does not read as a config opens in the JSON tab. */
  const showRawIfBroken = (text: string): void => {
    if (!fromJson(text).ok) setTab("json");
  };

  const loadLive = async (): Promise<void> => {
    dispatch({ type: "live-loading" });
    const result = await fetchLive();
    dispatch({ type: "live-result", result, adopt: "always" });
    if (result.status === "missing") {
      notify({
        tone: "info",
        description:
          "Nothing is published yet. Start from the template or open a file.",
      });
    } else if (result.status === "failed") {
      notify({
        tone: "danger",
        description: `The live file could not be loaded. ${result.message}`,
      });
    } else {
      showRawIfBroken(result.text);
    }
  };

  const loadTemplate = async (): Promise<void> => {
    try {
      loadText(await fetchTemplate(), { kind: "template" });
    } catch (error) {
      notify({
        tone: "danger",
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const openFile = async (file: File): Promise<void> => {
    try {
      loadText(await file.text(), { kind: "file", label: file.name });
    } catch {
      notify({
        tone: "danger",
        description: `${file.name} could not be read.`,
      });
    }
  };

  /** Starts one of the four load routes from a start card or the menu. */
  const startLoad = (route: LoadRoute): void => {
    switch (route) {
      case "live":
        replaceDraft(() => void loadLive());
        return;
      case "file":
        // The picker opens first; the confirmation comes once a file is chosen.
        fileInput.current?.click();
        return;
      case "paste":
        setIsPasting(true);
        return;
      case "template":
        replaceDraft(() => void loadTemplate());
        return;
    }
  };

  const onDroppedFile = useEffectEvent((file: File) =>
    replaceDraft(() => void openFile(file)),
  );

  useEffect(() => {
    const hasFiles = (event: DragEvent): boolean =>
      event.dataTransfer?.types.includes("Files") ?? false;
    const over = (event: DragEvent): void => {
      if (hasFiles(event)) event.preventDefault();
    };
    const drop = (event: DragEvent): void => {
      const file = event.dataTransfer?.files[0];
      if (!file) return;
      event.preventDefault();
      onDroppedFile(file);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const download = (): void => {
    downloadText(DOWNLOAD_NAME, currentText(state));
    dispatch({ type: "downloaded" });
    notify({
      tone: "success",
      description:
        "Downloaded surveys.json. The Publish tab says what happens next.",
    });
  };

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const copy = async (): Promise<void> => {
    const ok = await copyText(currentText(state));
    if (ok) {
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_DURATION);
    }
    notify(
      ok
        ? { tone: "success", description: "Copied the JSON to the clipboard." }
        : {
            tone: "warning",
            description:
              "The browser did not allow copying. Select the text in the JSON tab instead.",
          },
    );
  };

  /** Shows the survey at `index` and takes the reader to it. */
  const showSurvey = (index: number, target: FormTarget): void => {
    dispatch({ type: "select-survey", key: state.draft.surveys[index].key });
    setFormTarget(target);
  };

  const errorCount = state.rawProblem ? 1 : validation.errors.length;
  const warningCount = state.rawProblem ? 0 : validation.warnings.length;
  const problemCount = errorCount + warningCount;

  return (
    <div ref={rootRef} className="editor">
      <EditorHeader
        ref={headerRef}
        status={statusText(state)}
        hasDraft={hasDraft}
        unsaved={unsaved}
        isLoadingLive={state.live.status === "loading"}
        downloadBlockedBecause={downloadBlockedBecause}
        onLoad={startLoad}
        copied={copied}
        onCopy={() => void copy()}
        onDownload={download}
      />

      <main className="editor-main">
        {hasDraft ? (
          <div className="editor-layout">
            <SurveyNav
              draft={state.draft}
              validation={validation}
              filter={filter}
              onFilterChange={setFilter}
              selectedIndex={selectedIndex}
              onSelect={(index) =>
                showSurvey(index, { domId: fieldDomId(index), focus: false })
              }
              isPaused={isPaused}
              dispatch={dispatch}
            />

            <section className="editor-form">
              <SelectedSurvey
                draft={state.draft}
                validation={validation}
                index={selectedIndex}
                isPaused={isPaused}
                dispatch={dispatch}
              />
            </section>

            <section className="editor-side" aria-label="Check and publish">
              <Tabs
                aria-label="Check and publish"
                selectedKey={tab}
                onSelectionChange={setTab}
                collapseBelow={TABS_STACK_BELOW}
              >
                <TabItem
                  id="problems"
                  panelClassName="side-panel"
                  title={
                    problemCount > 0 ? `Problems (${problemCount})` : "Problems"
                  }
                >
                  <div className="side-panel-body">
                    <p
                      className="problems-summary"
                      aria-live="polite"
                      data-testid="summary"
                    >
                      {summaryText(errorCount, warningCount)}
                    </p>
                    <ValidationPanel
                      draft={state.draft}
                      validation={validation}
                      rawProblem={state.rawProblem}
                      onLocate={(index, field) =>
                        showSurvey(index, {
                          domId: fieldDomId(index, field),
                          focus: true,
                        })
                      }
                    />
                  </div>
                </TabItem>
                <TabItem
                  id="preview"
                  title="Preview"
                  panelClassName="side-panel"
                >
                  <div className="side-panel-body">
                    <PreviewPanel draft={state.draft} />
                  </div>
                </TabItem>
                <TabItem
                  id="changes"
                  title="Changes"
                  panelClassName="side-panel"
                >
                  <div className="side-panel-body">
                    <ChangesPanel live={state.live} draft={state.draft} />
                  </div>
                </TabItem>
                <TabItem id="json" title="JSON" panelClassName="side-panel">
                  <div className="side-panel-body">
                    <RawJsonPanel
                      text={state.rawText}
                      problem={state.rawProblem}
                      onChange={(text) => dispatch({ type: "edit-raw", text })}
                    />
                  </div>
                </TabItem>
                <TabItem
                  id="publish"
                  title="Publish"
                  panelClassName="side-panel"
                >
                  <div className="side-panel-body">
                    <PublishPanel />
                  </div>
                </TabItem>
              </Tabs>
            </section>
          </div>
        ) : (
          <StartPanel live={state.live} onLoad={startLoad} />
        )}
      </main>

      <input
        ref={fileInput}
        className="visually-hidden"
        type="file"
        accept=".json,application/json"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) replaceDraft(() => void openFile(file));
        }}
      />

      <PasteDialog
        isOpen={isPasting}
        onCancel={() => setIsPasting(false)}
        onLoad={(text) => {
          setIsPasting(false);
          replaceDraft(() => loadText(text, { kind: "paste" }));
        }}
      />

      <ConfirmDialog
        isOpen={pendingLoad !== null}
        title="Replace the draft?"
        confirmLabel="Replace draft"
        onCancel={() => setPendingLoad(null)}
        onConfirm={() => {
          pendingLoad?.();
          setPendingLoad(null);
        }}
      >
        <p>
          The draft has changes that have not been downloaded. Loading another
          config replaces them. Download first if you want to keep them.
        </p>
      </ConfirmDialog>

      <ToastRegion queue={toasts} label="Notifications" closeLabel="Dismiss" />
    </div>
  );
}

/** Where the draft came from, for the header. */
function statusText(state: EditorState): string {
  const { source, live } = state;
  const time = formatTime(source.at);
  switch (source.kind) {
    case "live":
      return `Loaded from the live file at ${time}.`;
    case "template":
      return `Started from the template at ${time}.`;
    case "file":
      return `Opened ${source.label ?? "a file"} at ${time}.`;
    case "paste":
      return `Pasted JSON at ${time}.`;
    case "restored":
      return `Unsaved draft restored (last changed at ${time}).`;
    case "none":
      if (live.status === "loading") return "Checking the live file...";
      if (live.status === "missing") return "Nothing is published yet.";
      if (live.status === "failed") return "The live file could not be loaded.";
      return "No config loaded yet.";
  }
}

function summaryText(errors: number, warnings: number): string {
  if (errors === 0 && warnings === 0) return "No problems found.";
  return `${plural(errors, "error")} and ${plural(warnings, "warning")}.`;
}
