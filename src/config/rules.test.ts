import { describe, expect, it } from "vitest";
import { parseConfig, type Survey } from "./config.ts";
import { selectSurvey, skipReason, type RuleContext } from "./rules.ts";
import type { SurveyState } from "./storage.ts";

// 02:00 UTC on 20 Oct is 13:00 AEDT on 20 Oct, inside the survey dates.
const NOW = new Date("2026-10-20T02:00:00Z");
const TODAY = "2026-10-20";

function survey(overrides: Partial<Survey> = {}): Survey {
  return {
    id: "s",
    enabled: true,
    archived: false,
    opens: "2026-10-13T00:00",
    closes: "2026-11-14T23:59",
    timezone: "Australia/Melbourne",
    services: ["Nectar Dashboard"],
    title: "Title",
    body: [],
    url: "https://example.org/survey",
    startLabel: "Start survey",
    laterLabel: "Not right now",
    dismissLabel: "Don't show me this again",
    ...overrides,
  };
}

function context(
  states: Record<string, SurveyState> = {},
  overrides: Partial<RuleContext> = {},
): RuleContext {
  return {
    service: "Nectar Dashboard",
    now: NOW,
    readState: (id) => states[id] ?? {},
    ...overrides,
  };
}

describe("skipReason", () => {
  it("returns undefined when the survey should be shown", () => {
    expect(skipReason(survey(), context())).toBeUndefined();
  });

  it("is archived before anything else is looked at", () => {
    expect(skipReason(survey({ archived: true }), context())).toBe("archived");
    expect(
      skipReason(survey({ archived: true, enabled: false }), context()),
    ).toBe("archived");
  });

  it("is disabled when enabled is false", () => {
    expect(skipReason(survey({ enabled: false }), context())).toBe("disabled");
  });

  it("is closed before opens and after closes", () => {
    expect(
      skipReason(
        survey(),
        context({}, { now: new Date("2026-10-12T12:00:00Z") }),
      ),
    ).toBe("closed");
    expect(
      skipReason(
        survey(),
        context({}, { now: new Date("2026-11-15T02:00:00Z") }),
      ),
    ).toBe("closed");
  });

  it("is open from the exact opening minute to the exact closing minute", () => {
    // 09:00 AEDT is 22:00 UTC the day before; 17:30 AEDT is 06:30 UTC.
    const timed = survey({
      opens: "2026-10-13T09:00",
      closes: "2026-11-14T17:30",
    });
    const at = (iso: string) =>
      skipReason(timed, context({}, { now: new Date(iso) }));
    expect(at("2026-10-12T21:59:00Z")).toBe("closed");
    expect(at("2026-10-12T22:00:00Z")).toBeUndefined();
    expect(at("2026-11-14T06:30:00Z")).toBeUndefined();
    expect(at("2026-11-14T06:31:00Z")).toBe("closed");
  });

  it("treats a date-only file as whole days in the survey's time zone", () => {
    const [dated] = parseConfig({
      surveys: [
        {
          id: "s",
          enabled: true,
          opens: "2026-10-13",
          closes: "2026-11-14",
          services: "all",
          title: "Title",
          url: "https://example.org/survey",
        },
      ],
    });
    const at = (iso: string) =>
      skipReason(dated, context({}, { now: new Date(iso) }));
    // 00:00 AEDT on 13 Oct is 13:00 UTC on 12 Oct; 23:59 AEDT on 14 Nov is
    // 12:59 UTC on 14 Nov.
    expect(at("2026-10-12T12:59:00Z")).toBe("closed");
    expect(at("2026-10-12T13:00:00Z")).toBeUndefined();
    expect(at("2026-11-14T12:59:59Z")).toBeUndefined();
    expect(at("2026-11-14T13:00:00Z")).toBe("closed");
  });

  it("is service when the service is not listed", () => {
    expect(
      skipReason(survey(), context({}, { service: "ARDC BinderHub Service" })),
    ).toBe("service");
  });

  it('matches every service when services is "all"', () => {
    expect(
      skipReason(
        survey({ services: "all" }),
        context({}, { service: "Anything" }),
      ),
    ).toBeUndefined();
  });

  it("is no-url when neither url nor urls has a usable link", () => {
    expect(
      skipReason(
        survey({ url: "", urls: { "Nectar Dashboard": "" } }),
        context(),
      ),
    ).toBe("no-url");
    expect(skipReason(survey({ url: undefined }), context())).toBe("no-url");
  });

  it("is dismissed when the user ticked the checkbox", () => {
    expect(skipReason(survey(), context({ s: { dismissed: true } }))).toBe(
      "dismissed",
    );
  });

  it("is clicked when the user started the survey", () => {
    expect(skipReason(survey(), context({ s: { clicked: true } }))).toBe(
      "clicked",
    );
  });

  it("is shown-today when it already opened today", () => {
    expect(skipReason(survey(), context({ s: { shownOn: TODAY } }))).toBe(
      "shown-today",
    );
  });

  it("shows again on the next day after being shown", () => {
    expect(
      skipReason(survey(), context({ s: { shownOn: "2026-10-19" } })),
    ).toBeUndefined();
  });

  it("compares shownOn with today in the survey's time zone", () => {
    // 14:00 UTC on 20 Oct is already 21 Oct in Melbourne.
    const lateUtc = new Date("2026-10-20T14:00:00Z");
    expect(
      skipReason(
        survey(),
        context({ s: { shownOn: TODAY } }, { now: lateUtc }),
      ),
    ).toBeUndefined();
  });

  it("never reads another survey's state", () => {
    expect(
      skipReason(
        survey({ id: "b" }),
        context({ a: { clicked: true, dismissed: true, shownOn: TODAY } }),
      ),
    ).toBeUndefined();
  });
});

describe("selectSurvey", () => {
  it("returns undefined for an empty list", () => {
    expect(selectSurvey([], context())).toBeUndefined();
  });

  it("returns the first showable survey in config order", () => {
    const first = survey({ id: "first" });
    const second = survey({ id: "second" });
    expect(selectSurvey([first, second], context())).toBe(first);
    expect(selectSurvey([second, first], context())).toBe(second);
  });

  it("skips surveys with a skip reason", () => {
    const disabled = survey({ id: "disabled", enabled: false });
    const clicked = survey({ id: "clicked" });
    const other = survey({ id: "other" });
    expect(
      selectSurvey(
        [disabled, clicked, other],
        context({ clicked: { clicked: true } }),
      ),
    ).toBe(other);
  });

  it("returns undefined when every survey is skipped", () => {
    expect(
      selectSurvey(
        [survey({ enabled: false }), survey({ id: "t", services: [] })],
        context(),
      ),
    ).toBeUndefined();
  });
});
