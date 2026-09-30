/**
 * What the browser remembers about each survey, kept in `localStorage` under
 * `nectar-survey:<survey id>`. Storage can be missing or blocked
 * (private browsing, strict privacy settings), so every function here
 * swallows failures: reads return an empty state and writes do nothing.
 */

/** Stored state of one survey. Each survey has its own key and state. */
export interface SurveyState {
  /** Calendar day ("YYYY-MM-DD", survey time zone) the popup last opened. */
  shownOn?: string;
  /** The user ticked "Don't show me this again". */
  dismissed?: boolean;
  /** The user clicked "Start survey" (approach 1: counts as done). */
  clicked?: boolean;
}

export const STORAGE_PREFIX = "nectar-survey:";

/**
 * Reads the stored state of one survey. Returns `{}` when storage is not
 * available, the key is missing or the value is not valid JSON. Fields with
 * the wrong type are left out.
 */
export function readState(surveyId: string): SurveyState {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + surveyId);
    if (raw === null) return {};
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }
    const record = value as Record<string, unknown>;
    const state: SurveyState = {};
    if (typeof record.shownOn === "string") state.shownOn = record.shownOn;
    if (typeof record.dismissed === "boolean") {
      state.dismissed = record.dismissed;
    }
    if (typeof record.clicked === "boolean") state.clicked = record.clicked;
    return state;
  } catch {
    return {};
  }
}

/**
 * Merges `patch` into the stored state of one survey and saves it. Fields not
 * in `patch` keep their stored value. Does nothing when storage fails.
 */
export function writeState(
  surveyId: string,
  patch: Partial<SurveyState>,
): void {
  try {
    const next = { ...readState(surveyId), ...patch };
    window.localStorage.setItem(
      STORAGE_PREFIX + surveyId,
      JSON.stringify(next),
    );
  } catch {
    // Storage is unavailable or full; the popup may then show again, which
    // is accepted.
  }
}

/**
 * Removes the stored state of every survey (every key starting with
 * `STORAGE_PREFIX`) and leaves all other keys alone. Used by the demo page's
 * "reset" control. Does nothing when storage fails.
 */
export function clearAllState(): void {
  try {
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    // Collected first because removing while iterating shifts the indexes.
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Storage is unavailable; there is nothing to clear.
  }
}
