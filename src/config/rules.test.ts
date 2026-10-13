import { describe, expect, it, vi } from "vitest";
import { parseConfig, type Survey } from "./config.ts";
import { selectSurvey, skipReason, type RuleContext } from "./rules.ts";
import type { SurveyState } from "./storage.ts";

// 02:00 UTC on 20 Oct is 13:00 AEDT on 20 Oct, inside the survey dates.
const NOW = new Date("2026-10-20T02:00:00Z");
const TODAY = "2026-10-20";
const AFTER_CLOSING = new Date("2026-11-15T02:00:00Z");

function survey(overrides: Partial<Survey> = {}): Survey {
  return {
    id: "s",
    status: "live",
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
    preview: false,
    readState: (id) => states[id] ?? {},
    ...overrides,
  };
}

describe("skipReason", () => {
  it("returns undefined when the survey should be shown", () => {
    expect(skipReason(survey(), context())).toBeUndefined();
  });

  it("is archived before anything else is looked at", () => {
    expect(skipReason(survey({ status: "archived" }), context())).toBe(
      "archived",
    );
    expect(
      skipReason(
        survey({ status: "archived", services: [], url: undefined }),
        context({ s: { dismissed: true } }, { now: AFTER_CLOSING }),
      ),
    ).toBe("archived");
  });

  it("is draft when the status is draft, before the dates are looked at", () => {
    expect(skipReason(survey({ status: "draft" }), context())).toBe("draft");
    expect(
      skipReason(
        survey({ status: "draft" }),
        context({}, { now: AFTER_CLOSING }),
      ),
    ).toBe("draft");
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
          status: "live",
          opens: "2026-10-13",
          closes: "2026-11-14",
          services: ["Nectar Dashboard"],
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

  it("matches each listed name exactly", () => {
    const two = survey({
      services: ["Nectar Dashboard", "ARDC BinderHub Service"],
    });
    expect(
      skipReason(two, context({}, { service: "ARDC BinderHub Service" })),
    ).toBeUndefined();
    expect(skipReason(two, context({}, { service: "nectar dashboard" }))).toBe(
      "service",
    );
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

describe("skipReason for preview surveys", () => {
  const underTest = survey({ status: "preview" });
  const inPreview = (
    states: Record<string, SurveyState> = {},
    overrides: Partial<RuleContext> = {},
  ) => context(states, { preview: true, ...overrides });

  it("is preview outside preview mode, before the dates and the rest", () => {
    expect(skipReason(underTest, context())).toBe("preview");
    expect(
      skipReason(
        survey({ status: "preview", services: [], url: undefined }),
        context({}, { now: AFTER_CLOSING }),
      ),
    ).toBe("preview");
  });

  it("is archived, not preview, once archived", () => {
    expect(skipReason(survey({ status: "archived" }), inPreview())).toBe(
      "archived",
    );
  });

  it("shows in preview mode", () => {
    expect(skipReason(underTest, inPreview())).toBeUndefined();
  });

  it("still obeys the dates, the service and the url in preview mode", () => {
    expect(skipReason(underTest, inPreview({}, { now: AFTER_CLOSING }))).toBe(
      "closed",
    );
    expect(
      skipReason(
        underTest,
        inPreview({}, { service: "ARDC BinderHub Service" }),
      ),
    ).toBe("service");
    expect(
      skipReason(survey({ status: "preview", url: undefined }), inPreview()),
    ).toBe("no-url");
  });

  it("never reads its stored state in preview mode", () => {
    const readState = vi.fn(() => ({
      dismissed: true,
      clicked: true,
      shownOn: TODAY,
    }));
    expect(skipReason(underTest, inPreview({}, { readState }))).toBeUndefined();
    expect(readState).not.toHaveBeenCalled();
  });

  it("leaves draft and live surveys as they are in preview mode", () => {
    expect(skipReason(survey({ status: "draft" }), inPreview())).toBe("draft");
    expect(skipReason(survey(), inPreview())).toBeUndefined();
    expect(skipReason(survey(), inPreview({ s: { dismissed: true } }))).toBe(
      "dismissed",
    );
    expect(skipReason(survey(), inPreview({ s: { shownOn: TODAY } }))).toBe(
      "shown-today",
    );
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
    const draft = survey({ id: "draft", status: "draft" });
    const clicked = survey({ id: "clicked" });
    const other = survey({ id: "other" });
    expect(
      selectSurvey(
        [draft, clicked, other],
        context({ clicked: { clicked: true } }),
      ),
    ).toBe(other);
  });

  it("tries preview surveys first in preview mode, each group in config order", () => {
    const live = survey({ id: "live" });
    const firstUnderTest = survey({ id: "first-preview", status: "preview" });
    const secondUnderTest = survey({ id: "second-preview", status: "preview" });
    expect(
      selectSurvey(
        [live, firstUnderTest, secondUnderTest],
        context({}, { preview: true }),
      ),
    ).toBe(firstUnderTest);
    expect(
      selectSurvey(
        [
          live,
          survey({ id: "linkless-preview", status: "preview", url: undefined }),
        ],
        context({}, { preview: true }),
      ),
    ).toBe(live);
  });

  it("picks live surveys as before outside preview mode", () => {
    const live = survey({ id: "live" });
    const underTest = survey({ id: "preview", status: "preview" });
    expect(selectSurvey([underTest, live], context())).toBe(live);
    expect(selectSurvey([underTest], context())).toBeUndefined();
  });

  it("returns undefined when every survey is skipped", () => {
    expect(
      selectSurvey(
        [survey({ status: "draft" }), survey({ id: "t", services: [] })],
        context(),
      ),
    ).toBeUndefined();
  });
});
