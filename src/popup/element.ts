/**
 * The `<nectar-survey>` custom element: a thin shell that reads its
 * attributes, fetches the survey config, applies the display rules and, when
 * a survey is due, loads the dialog chunk and mounts the dialog in its shadow
 * root. It also records the user's choice and announces it with an event.
 * Nothing here throws into the host page: a fault someone should fix (bad
 * attribute, failed request, invalid config, a dialog chunk that does not
 * load, render error) is one `console.warn` line, a normal rule outcome one
 * `console.debug` line, and either way nothing is rendered.
 *
 * This module runs on every page, so it must not import React, React Aria or
 * `@ardc-ui/react`, directly or through another module. All of that lives
 * behind the dynamic import of `./dialog.tsx`.
 */

import { parseConfig, type Survey } from "../config/config.ts";
import { calendarDay } from "../config/dates.ts";
import { selectSurvey } from "../config/rules.ts";
import {
  clearAllState,
  readState,
  writeState,
  type SurveyState,
} from "../config/storage.ts";
import type * as DialogModule from "./dialog.tsx";

/** Detail of every `nectar-survey:*` event. */
export interface SurveyEventDetail {
  surveyId: string;
}

type SurveyEventName = "open" | "start" | "later" | "dismiss";

const LOG_PREFIX = "nectar-survey:";
const DEFAULT_CONFIG_FILE = "surveys.json";

/**
 * URL the default config is resolved against: the entry script itself
 * (`nectar-survey.js`), whose module URL the build keeps in `import.meta.url`.
 * Under `pnpm dev` that is this source file, while `public/` files are served
 * from the dev server root, so the root is used instead.
 */
const SCRIPT_URL: string = import.meta.env.DEV
  ? new URL("/", location.href).href
  : import.meta.url;

/**
 * Logs a fault that someone should look at: visible in the console by
 * default, but never an error, so host page monitoring does not count the
 * popup as a broken page.
 */
function warn(message: string, error?: unknown): void {
  if (error === undefined) console.warn(`${LOG_PREFIX} ${message}`);
  else console.warn(`${LOG_PREFIX} ${message}`, error);
}

/** Logs a normal outcome of the rules; hidden unless verbose logging is on. */
function debug(message: string): void {
  console.debug(`${LOG_PREFIX} ${message}`);
}

/** Survey invitation popup. See README.md for attributes and events. */
export class NectarSurvey extends HTMLElement {
  static readonly observedAttributes = ["now"];

  /**
   * Forgets every survey choice stored in this browser. For the demo page;
   * call `refresh()` on an element afterwards to evaluate again.
   */
  static resetState(): void {
    clearAllState();
  }

  /**
   * Resolves when the latest evaluation has finished, whether or not the
   * popup opened, so the demo and tests can wait for "nothing shown".
   */
  settled: Promise<void> = Promise.resolve();

  private readonly shadow: ShadowRoot;
  private dialog: DialogModule.MountedDialog | undefined;
  private abort: AbortController | undefined;
  private connected = false;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  connectedCallback(): void {
    this.connected = true;
    void this.refresh();
  }

  disconnectedCallback(): void {
    this.connected = false;
    this.stop();
  }

  attributeChangedCallback(
    _name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    // Attributes present at upgrade arrive before connectedCallback, which
    // evaluates anyway.
    if (this.connected && oldValue !== newValue) void this.refresh();
  }

  /**
   * Closes the popup without recording a choice and evaluates the rules
   * again. Returns the new `settled` promise.
   */
  refresh(): Promise<void> {
    this.stop();
    const abort = new AbortController();
    this.abort = abort;
    this.settled = this.evaluate(abort.signal).catch((error: unknown) => {
      if (!abort.signal.aborted) warn("failed", error);
    });
    return this.settled;
  }

  /** Cancels a pending evaluation and unmounts the dialog. */
  private stop(): void {
    this.abort?.abort();
    this.abort = undefined;
    this.unmount();
  }

  /** Current time, or the `now` attribute when set; undefined if invalid. */
  private currentTime(): Date | undefined {
    const override = this.getAttribute("now");
    if (override === null) return new Date();
    const date = new Date(override);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  /**
   * The config address: `config-url` resolved against the page when set,
   * otherwise `surveys.json` in the folder the script was loaded from.
   */
  private configUrl(): string {
    const override = this.getAttribute("config-url");
    if (override) return new URL(override, document.baseURI).href;
    return new URL(DEFAULT_CONFIG_FILE, SCRIPT_URL).href;
  }

  /** One pass: fetch the config, pick a survey, show it. Throws on failure. */
  private async evaluate(signal: AbortSignal): Promise<void> {
    const service = this.getAttribute("service")?.trim();
    if (!service) {
      warn("no service attribute, nothing to show");
      return;
    }
    const now = this.currentTime();
    if (!now) {
      warn(`invalid now attribute "${this.getAttribute("now")}"`);
      return;
    }

    const url = this.configUrl();
    // "no-cache" keeps a copy but revalidates it on every page: an unchanged
    // file costs a 304 with no body, a changed one arrives at once.
    const response = await fetch(url, { cache: "no-cache", signal });
    if (!response.ok) {
      warn(`config request ${url} failed with status ${response.status}`);
      return;
    }
    const json: unknown = await response.json();
    if (signal.aborted) return;

    const survey = selectSurvey(parseConfig(json), { service, now, readState });
    if (!survey) {
      debug("no survey to show");
      return;
    }
    await this.show(survey, service, now, signal);
  }

  /**
   * Loads the dialog chunk, mounts the dialog, then marks the survey as shown
   * today and announces it. The showing is recorded only once the dialog has
   * rendered, so a chunk that does not load or a dialog that fails to render
   * never uses up the day's showing. A refresh or disconnection while the
   * chunk loads discards the result.
   */
  private async show(
    survey: Survey,
    service: string,
    now: Date,
    signal: AbortSignal,
  ): Promise<void> {
    let dialogModule: typeof DialogModule;
    try {
      dialogModule = await import("./dialog.tsx");
    } catch (error) {
      if (!signal.aborted) warn("could not load the dialog", error);
      return;
    }
    if (signal.aborted) return;

    const record = (name: SurveyEventName, patch: Partial<SurveyState>) => {
      writeState(survey.id, patch);
      this.emit(name, survey.id);
    };
    const dialog = dialogModule.mountDialog(this.shadow, {
      survey,
      service,
      onStart: (dismissed) => record("start", { clicked: true, dismissed }),
      onLater: () => record("later", { dismissed: false }),
      onDismiss: () => record("dismiss", { dismissed: true }),
      onError: (error) => warn("dialog failed", error),
    });
    if (!dialog) return;
    this.dialog = dialog;

    // Only now: a chunk that failed to load, or a dialog that failed to
    // render, must not use up the day's showing.
    writeState(survey.id, { shownOn: calendarDay(now, survey.timezone) });
    this.emit("open", survey.id);
  }

  /** Removes the dialog, if one is showing. */
  private unmount(): void {
    this.dialog?.unmount();
    this.dialog = undefined;
  }

  /** Dispatches a bubbling, composed `nectar-survey:<name>` event. */
  private emit(name: SurveyEventName, surveyId: string): void {
    this.dispatchEvent(
      new CustomEvent<SurveyEventDetail>(`nectar-survey:${name}`, {
        bubbles: true,
        composed: true,
        detail: { surveyId },
      }),
    );
  }
}
