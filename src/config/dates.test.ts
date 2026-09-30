import { describe, expect, it } from "vitest";
import type { Survey } from "./config.ts";
import {
  boundaryMinute,
  calendarDay,
  isOpen,
  isValidDate,
  isValidDateTime,
  isValidTimeZone,
  localMinute,
} from "./dates.ts";

function survey(overrides: Partial<Survey> = {}): Survey {
  return {
    id: "s",
    enabled: true,
    archived: false,
    opens: "2026-10-13T00:00",
    closes: "2026-11-14T23:59",
    timezone: "Australia/Melbourne",
    services: "all",
    title: "Title",
    body: [],
    url: "https://example.org/survey",
    startLabel: "Start survey",
    laterLabel: "Not right now",
    dismissLabel: "Don't show me this again",
    ...overrides,
  };
}

describe("calendarDay", () => {
  it("formats the day in the given time zone", () => {
    expect(calendarDay(new Date("2026-10-20T03:00:00Z"), "UTC")).toBe(
      "2026-10-20",
    );
  });

  it("is already the next day in Melbourne for a late UTC instant", () => {
    // 14:00 UTC on 12 Oct is 01:00 AEDT (UTC+11) on 13 Oct.
    const instant = new Date("2026-10-12T14:00:00Z");
    expect(calendarDay(instant, "UTC")).toBe("2026-10-12");
    expect(calendarDay(instant, "Australia/Melbourne")).toBe("2026-10-13");
  });

  it("pads single-digit months and days", () => {
    expect(calendarDay(new Date("2026-01-05T12:00:00Z"), "UTC")).toBe(
      "2026-01-05",
    );
  });
});

describe("localMinute", () => {
  it("formats the minute in the given time zone, 24-hour", () => {
    expect(localMinute(new Date("2026-10-20T15:07:00Z"), "UTC")).toBe(
      "2026-10-20T15:07",
    );
  });

  it("prints midnight as 00, never 24", () => {
    expect(localMinute(new Date("2026-10-20T00:00:00Z"), "UTC")).toBe(
      "2026-10-20T00:00",
    );
  });

  it("drops seconds, so the last second of a minute is still that minute", () => {
    expect(localMinute(new Date("2026-11-14T12:59:59Z"), "UTC")).toBe(
      "2026-11-14T12:59",
    );
  });

  it("follows the clock change when Melbourne starts daylight saving", () => {
    // On 4 Oct 2026 Melbourne clocks go from 02:00 AEST (UTC+10) straight
    // to 03:00 AEDT (UTC+11).
    const zone = "Australia/Melbourne";
    expect(localMinute(new Date("2026-10-03T15:59:00Z"), zone)).toBe(
      "2026-10-04T01:59",
    );
    expect(localMinute(new Date("2026-10-03T16:00:00Z"), zone)).toBe(
      "2026-10-04T03:00",
    );
  });

  it("follows the clock change when Melbourne ends daylight saving", () => {
    // On 5 Apr 2026 Melbourne clocks go from 03:00 AEDT back to 02:00 AEST,
    // so 02:30 happens twice.
    const zone = "Australia/Melbourne";
    expect(localMinute(new Date("2026-04-04T15:30:00Z"), zone)).toBe(
      "2026-04-05T02:30",
    );
    expect(localMinute(new Date("2026-04-04T16:30:00Z"), zone)).toBe(
      "2026-04-05T02:30",
    );
  });
});

describe("isOpen", () => {
  const s = survey();

  it("is closed just before the first day in Melbourne", () => {
    // 12:59 UTC on 12 Oct is 23:59 AEDT on 12 Oct.
    expect(isOpen(s, new Date("2026-10-12T12:59:00Z"))).toBe(false);
  });

  it("is open from midnight of the first day in Melbourne", () => {
    // 13:00 UTC on 12 Oct is 00:00 AEDT on 13 Oct.
    expect(isOpen(s, new Date("2026-10-12T13:00:00Z"))).toBe(true);
  });

  it("is open until the end of the last day in Melbourne", () => {
    // 12:59 UTC on 14 Nov is 23:59 AEDT on 14 Nov.
    expect(isOpen(s, new Date("2026-11-14T12:59:00Z"))).toBe(true);
  });

  it("is closed from midnight after the last day in Melbourne", () => {
    // 13:00 UTC on 14 Nov is 00:00 AEDT on 15 Nov.
    expect(isOpen(s, new Date("2026-11-14T13:00:00Z"))).toBe(false);
  });

  it("uses the survey's own time zone", () => {
    const utc = survey({ timezone: "UTC" });
    expect(isOpen(utc, new Date("2026-10-12T14:00:00Z"))).toBe(false);
    expect(isOpen(utc, new Date("2026-11-14T23:59:00Z"))).toBe(true);
  });

  it("opens and closes on the same day for a one-day survey", () => {
    const oneDay = survey({
      opens: "2026-10-13T00:00",
      closes: "2026-10-13T23:59",
    });
    expect(isOpen(oneDay, new Date("2026-10-13T02:00:00Z"))).toBe(true);
    expect(isOpen(oneDay, new Date("2026-10-13T13:00:00Z"))).toBe(false);
  });

  it("opens and closes to the minute, both ends included", () => {
    // 09:00 to 17:30 AEDT on 13 Oct is 22:00 to 06:30 UTC.
    const working = survey({
      opens: "2026-10-13T09:00",
      closes: "2026-10-13T17:30",
    });
    expect(isOpen(working, new Date("2026-10-12T21:59:59Z"))).toBe(false);
    expect(isOpen(working, new Date("2026-10-12T22:00:00Z"))).toBe(true);
    expect(isOpen(working, new Date("2026-10-13T06:30:59Z"))).toBe(true);
    expect(isOpen(working, new Date("2026-10-13T06:31:00Z"))).toBe(false);
  });

  it("is open for the single minute of a window whose ends are equal", () => {
    const minute = survey({
      opens: "2026-10-13T09:00",
      closes: "2026-10-13T09:00",
    });
    expect(isOpen(minute, new Date("2026-10-12T22:00:30Z"))).toBe(true);
    expect(isOpen(minute, new Date("2026-10-12T22:01:00Z"))).toBe(false);
  });
});

describe("boundaryMinute", () => {
  it("keeps a date and time exactly as written", () => {
    expect(boundaryMinute("2026-10-13T09:05", "opens")).toBe(
      "2026-10-13T09:05",
    );
    expect(boundaryMinute("2026-10-13T09:05", "closes")).toBe(
      "2026-10-13T09:05",
    );
  });

  it("reads a date alone as the first minute for opens", () => {
    expect(boundaryMinute("2026-10-13", "opens")).toBe("2026-10-13T00:00");
  });

  it("reads a date alone as the last minute, 23:59, for closes", () => {
    expect(boundaryMinute("2026-11-14", "closes")).toBe("2026-11-14T23:59");
  });

  it.each(["2026-02-30", "2026-10-13T25:00", "13/10/2026", ""])(
    "returns undefined for %j",
    (value) => {
      expect(boundaryMinute(value, "opens")).toBeUndefined();
    },
  );
});

describe("isValidDateTime", () => {
  it.each(["2026-10-13T00:00", "2026-10-13T23:59", "2028-02-29T12:30"])(
    "accepts %s",
    (value) => {
      expect(isValidDateTime(value)).toBe(true);
    },
  );

  it.each([
    "2026-10-13",
    "2026-02-30T09:00",
    "2026-10-13T24:00",
    "2026-10-13T25:00",
    "2026-10-13T09:60",
    "2026-10-13T9:00",
    "2026-10-13T09:00:00",
    "2026-10-13T09:00Z",
    "2026-10-13T09:00+11:00",
    "2026-10-13 09:00",
  ])("rejects %j", (value) => {
    expect(isValidDateTime(value)).toBe(false);
  });
});

describe("isValidDate", () => {
  it.each(["2026-10-13", "2028-02-29"])("accepts %s", (value) => {
    expect(isValidDate(value)).toBe(true);
  });

  it("accepts years below 100, as seen while a year is being typed", () => {
    expect(isValidDate("0002-10-02")).toBe(true);
    expect(isValidDate("0020-10-02")).toBe(true);
  });

  it.each([
    "2026-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "2026-10-1",
    "13/10/2026",
    "2026-10-13T00:00",
    "",
  ])("rejects %j", (value) => {
    expect(isValidDate(value)).toBe(false);
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects unknown ones", () => {
    expect(isValidTimeZone("Australia/Melbourne")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});
