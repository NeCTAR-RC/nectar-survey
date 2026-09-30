import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORAGE_PREFIX,
  clearAllState,
  readState,
  writeState,
} from "./storage.ts";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readState", () => {
  it("returns {} when nothing is stored", () => {
    expect(readState("s")).toEqual({});
  });

  it("reads the survey's own key", () => {
    localStorage.setItem(
      `${STORAGE_PREFIX}s`,
      JSON.stringify({
        shownOn: "2026-10-13",
        dismissed: true,
        clicked: false,
      }),
    );
    expect(readState("s")).toEqual({
      shownOn: "2026-10-13",
      dismissed: true,
      clicked: false,
    });
    expect(readState("other")).toEqual({});
  });

  it("returns {} for invalid JSON or a non-object value", () => {
    localStorage.setItem(`${STORAGE_PREFIX}a`, "{not json");
    localStorage.setItem(`${STORAGE_PREFIX}b`, "[1,2]");
    localStorage.setItem(`${STORAGE_PREFIX}c`, "true");
    expect(readState("a")).toEqual({});
    expect(readState("b")).toEqual({});
    expect(readState("c")).toEqual({});
  });

  it("leaves out fields of the wrong type", () => {
    localStorage.setItem(
      `${STORAGE_PREFIX}s`,
      JSON.stringify({ shownOn: 5, dismissed: "yes", clicked: true }),
    );
    expect(readState("s")).toEqual({ clicked: true });
  });

  // Each failure test stores a state first, so `{}` can only come from the
  // failure path and not from an empty store.
  it("returns {} when getItem throws", () => {
    writeState("s", { clicked: true });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(readState("s")).toEqual({});
  });

  it("returns {} when localStorage itself cannot be accessed", () => {
    writeState("s", { clicked: true });
    const getter = vi
      .spyOn(window, "localStorage", "get")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    expect(readState("s")).toEqual({});
    expect(getter).toHaveBeenCalled();
  });
});

describe("writeState", () => {
  it("merges the patch into the stored state", () => {
    writeState("s", { shownOn: "2026-10-13" });
    writeState("s", { dismissed: true });
    writeState("s", { shownOn: "2026-10-14" });
    expect(readState("s")).toEqual({ shownOn: "2026-10-14", dismissed: true });
  });

  it("keeps each survey's state separate", () => {
    writeState("a", { clicked: true });
    writeState("b", { shownOn: "2026-10-13" });
    expect(readState("a")).toEqual({ clicked: true });
    expect(readState("b")).toEqual({ shownOn: "2026-10-13" });
  });

  it("swallows setItem failures", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeState("s", { clicked: true })).not.toThrow();
  });

  it("swallows a failure to access localStorage", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => writeState("s", { clicked: true })).not.toThrow();
  });
});

describe("clearAllState", () => {
  it("removes every survey key and leaves unrelated keys alone", () => {
    writeState("a", { clicked: true });
    writeState("b", { dismissed: true });
    writeState("c", { shownOn: "2026-10-13" });
    localStorage.setItem("unrelated", "keep");
    localStorage.setItem("nectar-survey", "no colon, keep");

    clearAllState();

    expect(localStorage.length).toBe(2);
    expect(localStorage.getItem("unrelated")).toBe("keep");
    expect(localStorage.getItem("nectar-survey")).toBe("no colon, keep");
  });

  it("swallows a failure to access localStorage", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => clearAllState()).not.toThrow();
  });
});
