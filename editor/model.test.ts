import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarDateTime } from "@internationalized/date";
import exampleJson from "../public/surveys.example.json?raw";
import { parseConfig, SURVEY_STATUSES } from "../src/config/config.ts";
import {
  applyServiceSelection,
  boundaryFieldValue,
  browserTimeHint,
  carryOver,
  chooseStatus,
  DEFAULT_FILTER,
  diff,
  DRAFT_STORAGE_KEY,
  duplicateSurvey,
  errorCounts,
  filterSurveys,
  fromJson,
  isFilterActive,
  isKnownService,
  isShowingNow,
  issuesForSurvey,
  jsonErrorOffset,
  KNOWN_SERVICES,
  linkToLive,
  listedServices,
  loadDraft,
  matchesFilter,
  minuteText,
  newSurvey,
  previewConfig,
  previewLink,
  previewOutcome,
  SAMPLE_SURVEY_URL,
  saveDraft,
  SHOWING_NOW,
  serviceNames,
  serviceSelection,
  strippedMarkup,
  surveyName,
  toJson,
  toSurveyObject,
  validate,
  withShowingNow,
  type Draft,
  type DraftSurvey,
  type Issue,
  type StoredDraft,
  type SurveyFilter,
} from "./model/index.ts";

// 02:00 UTC on 20 Oct is 13:00 AEDT on 20 Oct.
const NOW = new Date("2026-10-20T02:00:00Z");

/**
 * A valid, live survey with a link, open on NOW, listing the four known
 * services by name.
 */
function survey(overrides: Partial<DraftSurvey> = {}): DraftSurvey {
  return {
    ...newSurvey([]),
    id: "nectar-2026",
    status: "live",
    opens: "2026-10-13T00:00",
    closes: "2026-11-14T23:59",
    title: "Tell us about your {service} experience",
    body: ["Hello"],
    url: "https://example.com/survey",
    ...overrides,
  };
}

function draftOf(...surveys: DraftSurvey[]): Draft {
  return { surveys, extra: {} };
}

function read(text: string): Draft {
  const result = fromJson(text);
  if (!result.ok) throw new Error(result.problem.message);
  return result.draft;
}

function fields(issues: Issue[]): (string | undefined)[] {
  return issues.map((issue) => issue.field);
}

beforeEach(() => {
  // parseConfig logs one line per skipped survey; keep test output clean.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("survey status", () => {
  const OLD_SHAPE = JSON.stringify({
    surveys: [
      {
        id: "old",
        enabled: true,
        archived: false,
        opens: "2026-10-13T00:00",
        closes: "2026-11-14T23:59",
        services: [...KNOWN_SERVICES],
        title: "Tell us about your {service} experience",
        url: "https://example.com/survey",
      },
    ],
  });

  it("round-trips each status, written right after the id", () => {
    const draft = draftOf(
      survey({ key: "a", id: "a", status: "draft" }),
      survey({ key: "b", id: "b", status: "live" }),
      survey({ key: "c", id: "c", status: "archived" }),
    );
    const text = toJson(draft);
    expect(text).toMatch(/"id": "a",\n\s+"status": "draft",\n\s+"opens"/);
    expect(read(text).surveys.map((s) => s.status)).toEqual([
      "draft",
      "live",
      "archived",
    ]);
  });

  it("reads a missing or unknown status as not chosen, and says so", () => {
    for (const status of [undefined, "published", true]) {
      const text = JSON.stringify({
        surveys: [{ ...toSurveyObject(survey()), status }],
      });
      const draft = read(text);
      expect(draft.surveys[0].status).toBe("");
      const result = validate(draft, NOW);
      expect(result.errors).toEqual([
        { surveyIndex: 0, field: "status", message: "Choose a status." },
      ]);
    }
  });

  it("loads an older file, explains its keys on Status and writes neither", () => {
    const draft = read(OLD_SHAPE);
    const [old] = draft.surveys;
    expect(old.status).toBe("");
    expect(old.extra).toEqual({ enabled: true, archived: false });

    const result = validate(draft, NOW);
    expect(fields(result.errors)).toEqual(["status"]);
    expect(result.warnings).toEqual([
      {
        surveyIndex: 0,
        field: "status",
        message:
          'Unknown key "enabled" (older format; choose a Status instead). The download leaves it out.',
      },
      {
        surveyIndex: 0,
        field: "status",
        message:
          'Unknown key "archived" (older format; choose a Status instead). The download leaves it out.',
      },
    ]);

    const text = toJson(draft);
    expect(text).toContain('"status": ""');
    expect(text).not.toContain('"enabled"');
    expect(text).not.toContain('"archived"');
  });

  it("drops the older keys when a status is chosen, keeping other unknown keys", () => {
    const old = survey({ status: "", extra: { enabled: true, colour: "red" } });
    expect(chooseStatus(old, "live")).toEqual({
      status: "live",
      extra: { colour: "red" },
    });
    const chosen = { ...old, ...chooseStatus(old, "live") };
    expect(validate(draftOf(chosen), NOW).warnings).toEqual([
      {
        surveyIndex: 0,
        message:
          'Unknown key "colour". It is kept in the file, but the popup ignores it.',
      },
    ]);
  });

  it("shows the older keys going and the status arriving in the diff", () => {
    const live = read(OLD_SHAPE);
    const draft = {
      ...live,
      surveys: live.surveys.map((s) => ({ ...s, ...chooseStatus(s, "live") })),
    };
    expect(diff(live, draft).changes).toEqual([
      { surveyId: "old", field: "status", from: "", to: "live" },
      { surveyId: "old", field: "enabled", from: "true", to: "" },
      { surveyId: "old", field: "archived", from: "false", to: "" },
    ]);
  });

  it("shows a status change as a field change", () => {
    const live = draftOf(survey({ status: "draft" }));
    const draft = draftOf({ ...live.surveys[0], status: "live" });
    expect(diff(live, draft).changes).toEqual([
      { surveyId: "nectar-2026", field: "status", from: "draft", to: "live" },
    ]);
  });

  it("raises no warnings for an archived survey but keeps its errors", () => {
    const warned = draftOf(survey({ status: "archived", url: "" }));
    const result = validate(warned, NOW);
    expect(result.warnings).toEqual([]);
    const broken = draftOf(survey({ status: "archived", title: "" }));
    expect(fields(validate(broken, NOW).errors)).toEqual(["title"]);
  });

  it("counts only live surveys in overlap warnings", () => {
    for (const status of ["draft", "archived"] as const) {
      const draft = draftOf(
        survey({ status }),
        survey({ key: "b", id: "other" }),
      );
      expect(validate(draft, NOW).warnings).toEqual([]);
    }
  });

  it("makes a duplicate a draft without the older keys", () => {
    const copy = duplicateSurvey(
      survey({ status: "archived", extra: { archived: true, colour: "red" } }),
    );
    expect(copy.status).toBe("draft");
    expect(copy.extra).toEqual({ colour: "red" });
  });
});

describe("service selection", () => {
  const [dashboard, jupyter, binder, desktop] = KNOWN_SERVICES;
  const three = [dashboard, jupyter, binder];
  const four = [...KNOWN_SERVICES];
  const five = [...four, "Other"];

  it("ticks exactly the names the survey lists", () => {
    expect(serviceSelection(survey({ services: three }), five)).toEqual(three);
    expect(serviceSelection(survey({ services: [] }), five)).toEqual([]);
  });

  it("lists exactly the ticked names, the last one too", () => {
    expect(
      applyServiceSelection(survey({ services: three }), four, four),
    ).toEqual(four);
    expect(
      applyServiceSelection(survey({ services: four }), three, four),
    ).toEqual(three);
    expect(applyServiceSelection(survey({ services: four }), [], four)).toEqual(
      [],
    );
  });

  it("keeps the survey's own names, blank rows included, after the ticked ones", () => {
    const withOwn = survey({ services: [dashboard, "Other", ""] });
    expect(
      applyServiceSelection(withOwn, [dashboard, "Other", desktop], five),
    ).toEqual([dashboard, desktop, "Other", ""]);
  });

  it("drops an own name that is unticked by hand", () => {
    const withOwn = survey({ services: [dashboard, "Other"] });
    expect(applyServiceSelection(withOwn, [dashboard], five)).toEqual([
      dashboard,
    ]);
  });
});

describe("service names", () => {
  it("lists the known four first, then other names in first-seen order", () => {
    const draft = draftOf(
      survey({ services: ["Zed", "Nectar Dashboard", " "] }),
      survey({
        key: "b",
        services: ["Alpha", "Zed"],
        urls: { Beta: "https://example.com/b", Alpha: "" },
      }),
    );
    expect(serviceNames(draft)).toEqual([
      ...KNOWN_SERVICES,
      "Zed",
      "Alpha",
      "Beta",
    ]);
  });

  it("is the known four for an empty draft", () => {
    expect(serviceNames(draftOf())).toEqual([...KNOWN_SERVICES]);
  });

  it("knows the four services by exact name", () => {
    expect(isKnownService("Nectar Dashboard")).toBe(true);
    expect(isKnownService("Nectar dashboard")).toBe(false);
  });

  it("lists the survey's names without blank rows", () => {
    expect(listedServices(survey({ services: ["Other", " "] }))).toEqual([
      "Other",
    ]);
  });
});

describe("toJson", () => {
  it("writes keys in config-reference order with two spaces and a trailing newline", () => {
    const text = toJson(
      draftOf(
        survey({
          timezone: "Australia/Perth",
          eyebrow: "Eyebrow",
          urls: { "Nectar Dashboard": "https://example.com/d" },
          startLabel: "Go",
          laterLabel: "Later",
          dismissLabel: "Never",
        }),
      ),
    );
    expect(text.endsWith("}\n")).toBe(true);
    expect(text.startsWith('{\n  "surveys": [\n    {\n      "id"')).toBe(true);
    expect(Object.keys(JSON.parse(text).surveys[0])).toEqual([
      "id",
      "status",
      "opens",
      "closes",
      "timezone",
      "services",
      "eyebrow",
      "title",
      "body",
      "url",
      "urls",
      "startLabel",
      "laterLabel",
      "dismissLabel",
    ]);
  });

  it("leaves out empty optional fields, blank paragraphs and blank service names", () => {
    const object = toSurveyObject(
      survey({
        timezone: "",
        eyebrow: "",
        body: ["", "  "],
        url: "",
        urls: { "Nectar Dashboard": "" },
        services: ["Nectar Dashboard", " "],
      }),
    );
    expect(object).toEqual({
      id: "nectar-2026",
      status: "live",
      opens: "2026-10-13T00:00",
      closes: "2026-11-14T23:59",
      services: ["Nectar Dashboard"],
      title: "Tell us about your {service} experience",
    });
  });

  it("writes the service list as given, without blank rows", () => {
    const listed = ["ARDC BinderHub Service", "Other", "", "Nectar Dashboard"];
    expect(toSurveyObject(survey({ services: listed })).services).toEqual([
      "ARDC BinderHub Service",
      "Other",
      "Nectar Dashboard",
    ]);
  });

  it("keeps unknown keys, after the known ones", () => {
    const text = '{"surveys":[{"note":"x","id":"a","title":"t"}],"version":2}';
    const out = JSON.parse(toJson(read(text)));
    expect(Object.keys(out)).toEqual(["surveys", "version"]);
    expect(Object.keys(out.surveys[0]).at(-1)).toBe("note");
    expect(out.surveys[0].note).toBe("x");
  });

  it("round-trips the shipped template, dropping only its empty links", () => {
    const out = JSON.parse(toJson(read(exampleJson)));
    const original = JSON.parse(exampleJson);
    delete original.surveys[0].url;
    delete original.surveys[0].urls;
    expect(out).toEqual(original);
  });
});

describe("fromJson", () => {
  it("reports a syntax error with its line and column", () => {
    const result = fromJson(
      '{\n  "surveys": [\n    { "id": "a" }\n    { "id": "b" }\n  ]\n}',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.line).toBe(4);
    expect(result.problem.column).toBe(5);
    expect(result.problem.message).not.toMatch(/position/);
  });

  it("explains a missing surveys list", () => {
    const result = fromJson('{"survey": []}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem.message).toMatch(/"surveys" list/);
  });

  it("refuses a known key with a type the form cannot hold", () => {
    const result = fromJson('{"surveys":[{"id":"a","title":5}]}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.message).toBe('Survey "a": "title" must be text.');
    }
  });

  it("reads a single body string as one paragraph and missing keys as empty", () => {
    const draft = read('{"surveys":[{"id":"a","body":"Hi"}]}');
    const [s] = draft.surveys;
    expect(s.body).toEqual(["Hi"]);
    expect(s.services).toEqual([]);
    expect(s.title).toBe("");
    expect(s.status).toBe("");
  });
});

describe("jsonErrorOffset", () => {
  it.each([
    '{"a": [1, 2.5e3, -0, true, null, "x\\n\\u00e9"]}',
    "  []  ",
    '"text"',
  ])("accepts valid JSON: %s", (text) => {
    expect(jsonErrorOffset(text)).toBeUndefined();
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it.each([
    ['{"surveys": [}', 13],
    ['{"a": 1,}', 8],
    ["{'a': 1}", 1],
    ['{"a": 01}', 7],
    ['{"a": "x\\q"}', 9],
    ["[1] 2", 4],
    ['{"a": ', 6],
  ] as const)("finds the error in %s at %i", (text, offset) => {
    expect(jsonErrorOffset(text)).toBe(offset);
    expect(() => JSON.parse(text)).toThrow();
  });

  it("gives a line and column even where the browser gives no position", () => {
    const result = fromJson('{\n  "surveys": [\n    }\n');
    expect(result).toMatchObject({
      ok: false,
      problem: { line: 3, column: 5, message: "Unexpected token '}'" },
    });
  });
});

describe("validate errors", () => {
  it("finds nothing wrong with a complete survey, which the popup keeps", () => {
    const draft = draftOf(survey());
    expect(validate(draft, NOW).errors).toEqual([]);
    expect(parseConfig(JSON.parse(toJson(draft)))).toHaveLength(1);
  });

  it.each([
    ["id", { id: " " }],
    ["title", { title: "" }],
    ["opens", { opens: "2026-02-30" }],
    ["opens", { opens: "2026-10-13T25:00" }],
    ["closes", { closes: "" }],
    ["closes", { closes: "2026-11-14T17:00:00" }],
    ["closes", { opens: "2026-11-20", closes: "2026-11-14" }],
    ["closes", { opens: "2026-11-14T17:01", closes: "2026-11-14T17:00" }],
    ["services", { services: [] }],
  ] satisfies [string, Partial<DraftSurvey>][])(
    "puts the error on %s whenever the popup would skip the survey",
    (field, overrides) => {
      const draft = draftOf(survey(overrides));
      const { errors } = validate(draft, NOW);
      expect(fields(errors)).toEqual([field]);
      expect(parseConfig(JSON.parse(toJson(draft)))).toHaveLength(0);
    },
  );

  it("reports every broken field at once", () => {
    const draft = draftOf(survey({ id: "", title: "", opens: "x" }));
    expect(fields(validate(draft, NOW).errors)).toEqual([
      "id",
      "title",
      "opens",
    ]);
  });

  it("flags an unknown time zone, which the popup would silently replace", () => {
    const draft = draftOf(survey({ timezone: "Australia/Nowhere" }));
    expect(fields(validate(draft, NOW).errors)).toEqual(["timezone"]);
  });

  it("flags links that are not http(s) addresses", () => {
    const draft = draftOf(
      survey({
        url: "surveymonkey.com/r/x",
        urls: { "Nectar Dashboard": "javascript:alert(1)" },
      }),
    );
    expect(fields(validate(draft, NOW).errors)).toEqual([
      "url",
      "urls.Nectar Dashboard",
    ]);
  });

  it("flags a repeated id on the later survey", () => {
    const draft = draftOf(survey(), survey({ key: "other" }));
    const { errors } = validate(draft, NOW);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      surveyIndex: 1,
      field: "id",
      message:
        "The survey at position 1 already uses this id. Each survey needs its own, because the browser remembers choices by id.",
    });
  });
});

describe("new surveys and their names", () => {
  it("starts a new survey with the four known services listed by name", () => {
    const fresh = newSurvey([]);
    expect(fresh.services).toEqual([...KNOWN_SERVICES]);
    expect(toSurveyObject(fresh).services).toEqual([...KNOWN_SERVICES]);
  });

  it("writes a loaded service list back unchanged", () => {
    const services = [
      "ARDC Virtual Desktop Service",
      "Other",
      "Nectar Dashboard",
    ];
    const draft = read(JSON.stringify({ surveys: [{ id: "a", services }] }));
    expect(JSON.parse(toJson(draft)).surveys[0].services).toEqual(services);
  });

  it('refuses a file whose services is "all"', () => {
    const result = fromJson('{"surveys":[{"id":"a","services":"all"}]}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.message).toBe(
        'Survey "a": "services" must be a list of service names.',
      );
    }
  });

  it("suggests survey-1 when no survey has a survey-<n> id", () => {
    expect(newSurvey([]).id).toBe("survey-1");
    expect(newSurvey(["nectar-2026"]).id).toBe("survey-1");
  });

  it("suggests the lowest survey-<n> that is free", () => {
    const ids = ["survey-1", "survey-2", "survey-4", "survey-5"];
    expect(newSurvey(ids).id).toBe("survey-3");
    expect(newSurvey([...ids, "survey-3"]).id).toBe("survey-6");
  });

  it("names a survey by its id, or as this survey without one", () => {
    expect(surveyName(survey({ id: "survey-6" }))).toBe("survey-6");
    expect(surveyName(survey({ id: "" }))).toBe("this survey");
  });
});

describe("dates and times", () => {
  it("explains a value that is neither a date nor a date and time", () => {
    const { errors } = validate(
      draftOf(survey({ opens: "2026-10-13T25:00", closes: "" })),
      NOW,
    );
    expect(errors.map((issue) => issue.message)).toEqual([
      "Opens must be a date, or a date and time, such as 2026-10-13T09:00.",
      "Enter a date and time.",
    ]);
  });

  it("accepts opens equal to closes", () => {
    const draft = draftOf(
      survey({ opens: "2026-10-13T09:00", closes: "2026-10-13T09:00" }),
    );
    expect(validate(draft, NOW).errors).toEqual([]);
    expect(parseConfig(JSON.parse(toJson(draft)))).toHaveLength(1);
  });

  it("accepts a date-only closes on the day a timed opens starts", () => {
    const draft = draftOf(
      survey({ opens: "2026-11-14T17:00", closes: "2026-11-14" }),
    );
    expect(validate(draft, NOW).errors).toEqual([]);
  });

  it("validates and writes the typed text without changing it", () => {
    const draft = draftOf(
      survey({ opens: "2026-10-13T09:05", closes: "2026-11-14T17:30" }),
    );
    expect(validate(draft, NOW).errors).toEqual([]);
    const [written] = JSON.parse(toJson(draft)).surveys;
    expect([written.opens, written.closes]).toEqual([
      "2026-10-13T09:05",
      "2026-11-14T17:30",
    ]);
    const [reread] = read(toJson(draft)).surveys;
    expect([reread.opens, reread.closes]).toEqual([
      "2026-10-13T09:05",
      "2026-11-14T17:30",
    ]);
  });

  it("writes a date-only value from a file back unchanged unless edited", () => {
    const text =
      '{"surveys":[{"id":"a","status":"draft","opens":"2026-10-13","closes":"2026-11-14","services":["Nectar Dashboard"],"title":"t"}]}';
    const loaded = read(text);
    expect(validate(loaded, NOW).errors).toEqual([]);
    const [kept] = JSON.parse(toJson(loaded)).surveys;
    expect([kept.opens, kept.closes]).toEqual(["2026-10-13", "2026-11-14"]);

    const edited = draftOf({
      ...loaded.surveys[0],
      closes: "2026-11-14T17:30",
    });
    const [changed] = JSON.parse(toJson(edited)).surveys;
    expect([changed.opens, changed.closes]).toEqual([
      "2026-10-13",
      "2026-11-14T17:30",
    ]);
  });

  it("gives a duplicate the implied times of date-only values", () => {
    const copy = duplicateSurvey(
      survey({ opens: "2026-10-13", closes: "2026-11-14" }),
    );
    expect([copy.opens, copy.closes]).toEqual([
      "2026-10-13T00:00",
      "2026-11-14T23:59",
    ]);
    const timed = duplicateSurvey(
      survey({ opens: "2026-10-13T09:00", closes: "x" }),
    );
    expect([timed.opens, timed.closes]).toEqual(["2026-10-13T09:00", "x"]);
  });

  it("shows a date alone at its implied time in the field", () => {
    expect(boundaryFieldValue("2026-10-13", "opens")).toEqual(
      new CalendarDateTime(2026, 10, 13, 0, 0),
    );
    expect(boundaryFieldValue("2026-11-14", "closes")).toEqual(
      new CalendarDateTime(2026, 11, 14, 23, 59),
    );
    expect(boundaryFieldValue("2026-10-13T09:05", "closes")).toEqual(
      new CalendarDateTime(2026, 10, 13, 9, 5),
    );
    expect(boundaryFieldValue("13/10/2026", "opens")).toBeNull();
  });

  it("writes a field value as minutes, without seconds", () => {
    expect(minuteText(new CalendarDateTime(2026, 1, 5, 7, 3, 45))).toBe(
      "2026-01-05T07:03",
    );
    expect(minuteText(null)).toBe("");
  });
});

describe("browserTimeHint", () => {
  it("gives the time on the browser's clock when the zones differ", () => {
    // 10:00 AEDT (UTC+11) is 07:00 AWST (UTC+8).
    expect(
      browserTimeHint(
        "2026-10-13T10:00",
        "opens",
        "Australia/Melbourne",
        "Australia/Perth",
      ),
    ).toBe(
      "In your time zone (Australia/Perth): 7:00 am, Tuesday 13 October 2026.",
    );
  });

  it("uses the implied time of a date alone and the default zone when empty", () => {
    // 23:59 AEDT on 14 Nov is 20:59 AWST.
    expect(browserTimeHint("2026-11-14", "closes", "", "Australia/Perth")).toBe(
      "In your time zone (Australia/Perth): 8:59 pm, Saturday 14 November 2026.",
    );
  });

  it("can fall on another day in the browser's zone", () => {
    // 00:00 AEDT on 13 Oct is 13:00 UTC on 12 Oct.
    expect(
      browserTimeHint("2026-10-13", "opens", "Australia/Melbourne", "UTC"),
    ).toBe("In your time zone (UTC): 1:00 pm, Monday 12 October 2026.");
  });

  it("says nothing when the zones match, the zone is unknown or the value is invalid", () => {
    const perth = "Australia/Perth";
    expect(
      browserTimeHint("2026-10-13T10:00", "opens", perth, perth),
    ).toBeUndefined();
    expect(
      browserTimeHint("2026-10-13T10:00", "opens", "", "Australia/Melbourne"),
    ).toBeUndefined();
    expect(
      browserTimeHint("2026-10-13T10:00", "opens", "Mars/Base", perth),
    ).toBeUndefined();
    expect(
      browserTimeHint("2026-10-13T25:00", "opens", "UTC", perth),
    ).toBeUndefined();
    expect(browserTimeHint("", "opens", "UTC", perth)).toBeUndefined();
  });
});

describe("validate warnings", () => {
  const warningsFor = (draft: Draft): Issue[] => validate(draft, NOW).warnings;

  it("has none for a complete survey", () => {
    expect(warningsFor(draftOf(survey()))).toEqual([]);
  });

  it("warns when a live survey has no link at all", () => {
    const warnings = warningsFor(draftOf(survey({ url: "" })));
    expect(fields(warnings)).toEqual(["url"]);
    expect(warnings[0].message).toBe(
      "This survey is live but has no survey link, so the popup does not show it anywhere.",
    );
  });

  it("warns per service when only some services have a link", () => {
    const draft = draftOf(
      survey({
        url: "",
        services: ["Nectar Dashboard", "ARDC BinderHub Service"],
        urls: { "Nectar Dashboard": "https://example.com/d" },
      }),
    );
    expect(fields(warningsFor(draft))).toEqual(["urls.ARDC BinderHub Service"]);
  });

  it("does not ask for links while a survey is a draft", () => {
    expect(warningsFor(draftOf(survey({ status: "draft", url: "" })))).toEqual(
      [],
    );
  });

  it("marks a closed survey's timing instead of warning about it", () => {
    const draft = draftOf(
      survey({ opens: "2026-01-01", closes: "2026-01-31" }),
      survey({ key: "b", id: "open" }),
    );
    const result = validate(draft, NOW);
    expect(result.timing).toEqual(["closed", "open"]);
    expect(result.warnings).toEqual([]);
  });

  it("warns when the survey opens more than a year away", () => {
    const later = draftOf(
      survey({ opens: "2027-10-21", closes: "2027-11-01" }),
    );
    const inAYear = draftOf(
      survey({ opens: "2027-10-20", closes: "2027-11-01" }),
    );
    expect(fields(warningsFor(later))).toEqual(["opens"]);
    expect(warningsFor(inAYear)).toEqual([]);
  });

  it("warns when two live surveys overlap for the same service", () => {
    const draft = draftOf(
      survey({ services: ["Nectar Dashboard"] }),
      survey({
        key: "b",
        id: "other",
        opens: "2026-11-01",
        closes: "2026-12-01",
      }),
    );
    const warnings = warningsFor(draft);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ surveyIndex: 1, field: "services" });
    expect(warnings[0].message).toBe(
      "other overlaps nectar-2026 on Nectar Dashboard. The popup shows the first matching survey in the list, so other only reaches people who have already started or dismissed nectar-2026.",
    );
  });

  it("lists shared services with a final and", () => {
    const draft = draftOf(
      survey({ services: ["Nectar Dashboard", "ARDC BinderHub Service"] }),
      survey({ key: "b", id: "other" }),
    );
    expect(warningsFor(draft)[0].message).toContain(
      "on Nectar Dashboard and ARDC BinderHub Service.",
    );
  });

  it("does not warn about overlaps that miss in time or service", () => {
    const draft = draftOf(
      survey({ services: ["Nectar Dashboard"] }),
      survey({ key: "b", id: "b", services: ["ARDC BinderHub Service"] }),
      survey({ key: "c", id: "c", opens: "2026-11-15", closes: "2026-12-01" }),
    );
    expect(warningsFor(draft)).toEqual([]);
  });

  it("warns about a service name outside the known four", () => {
    const draft = draftOf(survey({ services: ["Nectar dashboard"] }));
    expect(warningsFor(draft)).toEqual([
      {
        surveyIndex: 0,
        field: "services",
        message:
          '"Nectar dashboard" is not a service the editor knows. It only matches a host that sends exactly this name; check the spelling.',
      },
    ]);
  });

  it("warns about an unknown name only on the survey that lists it", () => {
    const draft = draftOf(
      survey({ services: ["Nectar Dashboard", "Other"], urls: { Other: "" } }),
      survey({ key: "b", id: "known" }),
    );
    const unknown = warningsFor(draft).filter((w) =>
      w.message.includes("is not a service the editor knows"),
    );
    expect(unknown.map((w) => w.surveyIndex)).toEqual([0]);
  });

  it("warns when the title has no {service} placeholder", () => {
    const draft = draftOf(survey({ title: "Tell us what you think" }));
    expect(fields(warningsFor(draft))).toEqual(["title"]);
  });

  it("warns about markup the sanitiser would not keep", () => {
    const draft = draftOf(
      survey({
        body: ["<strong>ok</strong>", 'Hi <span class="x">there</span>'],
      }),
    );
    expect(fields(warningsFor(draft))).toEqual(["body.1"]);
  });

  it("warns about markup in plain text fields", () => {
    const draft = draftOf(
      survey({
        title: "About <strong>{service}</strong>",
        eyebrow: "A &amp; B",
      }),
    );
    expect(fields(warningsFor(draft))).toEqual(["eyebrow", "title"]);
  });

  it("warns when the id differs from the live survey's", () => {
    const draft = draftOf(
      survey({ id: "nectar-2026-b", liveId: "nectar-2026" }),
    );
    expect(fields(warningsFor(draft))).toEqual(["id"]);
  });

  it("suggests a slug for other ids", () => {
    expect(fields(warningsFor(draftOf(survey({ id: "Nectar 2026" }))))).toEqual(
      ["id"],
    );
  });

  it("notes unknown keys in a survey and at the top level", () => {
    const draft: Draft = {
      surveys: [survey({ extra: { opensOn: "2026-10-13" } })],
      extra: { version: 2 },
    };
    const warnings = warningsFor(draft);
    expect(warnings.map((w) => w.surveyIndex)).toEqual([0, undefined]);
    expect(warnings[0].message).toContain('"opensOn"');
  });
});

describe("timing", () => {
  const timingOf = (overrides: Partial<DraftSurvey>) =>
    validate(draftOf(survey(overrides)), NOW).timing[0];

  it("is open from the opening minute to the closing minute, both included", () => {
    expect(
      timingOf({ opens: "2026-10-20T13:00", closes: "2026-10-20T13:00" }),
    ).toBe("open");
  });

  it("is upcoming until the opening minute", () => {
    expect(timingOf({ opens: "2026-10-20T13:01" })).toBe("upcoming");
  });

  it("is closed from the minute after the closing minute", () => {
    expect(
      timingOf({ opens: "2026-10-01T00:00", closes: "2026-10-20T12:59" }),
    ).toBe("closed");
  });

  it("reads the dates in the survey's time zone", () => {
    // 13:00 in Melbourne is 10:00 in Perth.
    expect(
      timingOf({ opens: "2026-10-20T11:00", timezone: "Australia/Perth" }),
    ).toBe("upcoming");
  });

  it("is undefined when the popup skips the survey", () => {
    expect(timingOf({ closes: "soon" })).toBeUndefined();
    expect(timingOf({ title: "" })).toBeUndefined();
  });

  it("is listed for archived surveys too", () => {
    expect(timingOf({ status: "archived" })).toBe("open");
  });
});

describe("errorCounts", () => {
  it("counts each survey's errors and leaves out errors about the file", () => {
    const validation = {
      errors: [
        { surveyIndex: 1, message: "a" },
        { surveyIndex: 1, field: "id", message: "b" },
        { message: "c" },
      ],
      warnings: [{ surveyIndex: 0, message: "d" }],
      timing: [],
    };
    expect(errorCounts(validation, 3)).toEqual([0, 2, 0]);
  });
});

describe("the Would show now preset", () => {
  it("is open now and live", () => {
    expect(SHOWING_NOW).toEqual({ dates: "open", status: "live" });
  });

  it("leaves out an open preview survey", () => {
    const filter: SurveyFilter = { search: "", ...SHOWING_NOW };
    expect(matchesFilter(survey(), "open", filter)).toBe(true);
    expect(matchesFilter(survey({ status: "preview" }), "open", filter)).toBe(
      false,
    );
  });

  it("is on exactly while both groups hold the preset", () => {
    expect(isShowingNow({ search: "x", ...SHOWING_NOW })).toBe(true);
    expect(
      isShowingNow({ ...SHOWING_NOW, search: "", service: "Nectar Dashboard" }),
    ).toBe(true);
    expect(isShowingNow(DEFAULT_FILTER)).toBe(false);
    expect(
      isShowingNow({ ...SHOWING_NOW, search: "", dates: "upcoming" }),
    ).toBe(false);
    expect(
      isShowingNow({ ...SHOWING_NOW, search: "", status: undefined }),
    ).toBe(false);
  });

  it("turns on over any groups and keeps the search and the service", () => {
    const filter: SurveyFilter = {
      search: "nectar",
      dates: "closed",
      status: "archived",
      service: "Nectar Dashboard",
    };
    expect(withShowingNow(filter, true)).toEqual({
      search: "nectar",
      service: "Nectar Dashboard",
      ...SHOWING_NOW,
    });
  });

  it("turns off to the default groups and keeps the search and the service", () => {
    const on = withShowingNow(
      { search: "nectar", service: "Nectar Dashboard" },
      true,
    );
    const off = withShowingNow(on, false);
    expect(off).toEqual({
      search: "nectar",
      service: "Nectar Dashboard",
      dates: undefined,
      status: undefined,
    });
    expect(isShowingNow(off)).toBe(false);
  });
});

describe("survey filter", () => {
  const anything: SurveyFilter = { search: "" };

  it("starts on every survey but the archived ones, which is not counted as filtering", () => {
    expect(DEFAULT_FILTER).toEqual({ search: "" });
    expect(isFilterActive(DEFAULT_FILTER)).toBe(false);
    expect(isFilterActive({ ...DEFAULT_FILTER, search: "  " })).toBe(false);
  });

  it("counts any change from the default, or search text, as filtering", () => {
    expect(isFilterActive({ ...DEFAULT_FILTER, search: "nectar" })).toBe(true);
    expect(isFilterActive({ ...DEFAULT_FILTER, dates: "open" })).toBe(true);
    for (const status of SURVEY_STATUSES) {
      expect(isFilterActive({ ...DEFAULT_FILTER, status })).toBe(true);
    }
    expect(
      isFilterActive({ ...DEFAULT_FILTER, service: "Nectar Dashboard" }),
    ).toBe(true);
  });

  it("finds the search text in the id or the title, ignoring case", () => {
    const target = survey({ id: "nectar-2026", title: "About {service}" });
    expect(matchesFilter(target, "open", { search: "NECTAR" })).toBe(true);
    expect(matchesFilter(target, "open", { search: "about" })).toBe(true);
    expect(matchesFilter(target, "open", { search: " 2026 " })).toBe(true);
    expect(matchesFilter(target, "open", { search: "binder" })).toBe(false);
  });

  it("matches a Dates choice on the survey's timing only", () => {
    const target = survey();
    expect(matchesFilter(target, "open", { search: "", dates: "open" })).toBe(
      true,
    );
    expect(
      matchesFilter(target, "upcoming", { search: "", dates: "open" }),
    ).toBe(false);
    expect(
      matchesFilter(target, "closed", { search: "", dates: "closed" }),
    ).toBe(true);
  });

  it("matches no Dates choice when the dates do not read", () => {
    const unreadable = survey({ closes: "soon" });
    for (const dates of ["open", "upcoming", "closed"] as const) {
      expect(matchesFilter(unreadable, undefined, { search: "", dates })).toBe(
        false,
      );
    }
    expect(matchesFilter(unreadable, undefined, anything)).toBe(true);
  });

  it("matches a Status choice on the survey's status only", () => {
    const byStatus = {
      draft: survey({ status: "draft" }),
      preview: survey({ status: "preview" }),
      live: survey({ status: "live" }),
      archived: survey({ status: "archived" }),
    };
    for (const chosen of SURVEY_STATUSES) {
      for (const [status, target] of Object.entries(byStatus)) {
        expect(
          matchesFilter(target, "open", { search: "", status: chosen }),
        ).toBe(status === chosen);
      }
    }
    expect(
      matchesFilter(survey({ status: "" }), "open", {
        search: "",
        status: "draft",
      }),
    ).toBe(false);
  });

  it("hides archived surveys until the Archived choice is made", () => {
    expect(
      matchesFilter(survey({ status: "archived" }), "open", DEFAULT_FILTER),
    ).toBe(false);
    for (const status of ["draft", "live", ""] as const) {
      expect(matchesFilter(survey({ status }), "open", DEFAULT_FILTER)).toBe(
        true,
      );
    }
  });

  it("matches only a service the survey lists", () => {
    const binder = { search: "", service: "ARDC BinderHub Service" };
    const dashboardOnly = survey({ services: ["Nectar Dashboard"] });
    const everywhere = survey({ services: [...KNOWN_SERVICES] });
    expect(matchesFilter(dashboardOnly, "open", binder)).toBe(false);
    expect(
      matchesFilter(dashboardOnly, "open", {
        search: "",
        service: "Nectar Dashboard",
      }),
    ).toBe(true);
    for (const service of KNOWN_SERVICES) {
      expect(matchesFilter(everywhere, "open", { search: "", service })).toBe(
        true,
      );
    }
  });

  it("needs every group to match", () => {
    const filter: SurveyFilter = {
      search: "nectar",
      dates: "open",
      status: "live",
    };
    expect(matchesFilter(survey(), "open", filter)).toBe(true);
    expect(matchesFilter(survey({ status: "draft" }), "open", filter)).toBe(
      false,
    );
    expect(matchesFilter(survey(), "closed", filter)).toBe(false);
    expect(matchesFilter(survey({ id: "other" }), "open", filter)).toBe(false);
  });

  it("lists the matching indices in file order", () => {
    const draft = draftOf(
      survey({ key: "a", id: "first" }),
      survey({
        key: "b",
        id: "closed",
        opens: "2026-01-01",
        closes: "2026-01-31",
      }),
      survey({ key: "c", id: "archived", status: "archived" }),
      survey({
        key: "d",
        id: "later",
        opens: "2026-12-01",
        closes: "2026-12-31",
      }),
    );
    const validation = validate(draft, NOW);
    expect(filterSurveys(draft, validation, DEFAULT_FILTER)).toEqual([0, 1, 3]);
    expect(
      filterSurveys(draft, validation, { ...DEFAULT_FILTER, dates: "closed" }),
    ).toEqual([1]);
    expect(
      filterSurveys(draft, validation, { search: "", dates: "open" }),
    ).toEqual([0]);
    expect(
      filterSurveys(draft, validation, {
        search: "",
        dates: "open",
        status: "archived",
      }),
    ).toEqual([2]);
    expect(
      filterSurveys(draft, validation, { search: "", status: "archived" }),
    ).toEqual([2]);
    expect(
      filterSurveys(draft, validation, { search: "", dates: "upcoming" }),
    ).toEqual([3]);
    expect(
      filterSurveys(draft, validation, withShowingNow(DEFAULT_FILTER, true)),
    ).toEqual([0]);
  });
});

describe("strippedMarkup", () => {
  it("keeps allowed markup, plain text and ampersands", () => {
    expect(
      strippedMarkup(
        'A & B <strong>x</strong> <em>y</em> <a href="https://e.org">z</a> 5 < 6',
      ),
    ).toEqual([]);
  });

  it("names elements, attributes and comments the sanitiser drops", () => {
    expect(strippedMarkup("<span>x</span>")).toEqual(["<span>"]);
    expect(strippedMarkup('<strong class="big">x</strong>')).toEqual([
      "attributes on <strong>",
    ]);
    expect(strippedMarkup('<a href="javascript:x">y</a>')).toEqual(["<a>"]);
    expect(strippedMarkup("x <!-- note -->")).toEqual(["comments"]);
  });
});

describe("issuesForSurvey", () => {
  it("groups one survey's issues by field", () => {
    const draft = draftOf(survey({ title: "" }), survey({ key: "b", id: "" }));
    const issues = issuesForSurvey(validate(draft, NOW), 0);
    expect([...issues.keys()]).toEqual(["title"]);
    expect(issues.get("title")?.errors).toEqual(["Enter a title."]);
  });
});

describe("diff", () => {
  const live = draftOf(
    survey({ key: "l1" }),
    survey({ key: "l2", id: "old", title: "Old {service}" }),
  );

  it("is empty for an unchanged draft", () => {
    expect(diff(live, live)).toEqual({ added: [], removed: [], changes: [] });
  });

  it("lists added and removed surveys and changed fields", () => {
    const draft = draftOf(
      survey({ title: "New {service}", body: ["Hello", "More"], url: "" }),
      survey({ key: "n", id: "new" }),
    );
    expect(diff(live, draft)).toEqual({
      added: ["new"],
      removed: ["old"],
      changes: [
        {
          surveyId: "nectar-2026",
          field: "title",
          from: "Tell us about your {service} experience",
          to: "New {service}",
        },
        {
          surveyId: "nectar-2026",
          field: "url",
          from: "https://example.com/survey",
          to: "",
        },
        {
          surveyId: "nectar-2026",
          field: "body paragraph 2",
          from: "",
          to: "More",
        },
      ],
    });
  });

  it("follows a renamed survey through its live id and reports moves", () => {
    const draft = draftOf(
      survey({
        key: "x",
        id: "renamed",
        liveId: "old",
        title: "Old {service}",
      }),
      survey(),
    );
    expect(diff(live, draft).changes).toEqual([
      { surveyId: "old", field: "id", from: "old", to: "renamed" },
      { surveyId: "old", field: "position", from: "2", to: "1" },
      { surveyId: "nectar-2026", field: "position", from: "1", to: "2" },
    ]);
  });

  it("treats every survey as added when nothing is live", () => {
    expect(diff(null, live).added).toEqual(["nectar-2026", "old"]);
  });
});

describe("linking to live", () => {
  it("links surveys that share an id with a live one", () => {
    const linked = linkToLive(
      draftOf(survey(), survey({ id: "b" })),
      draftOf(survey()),
    );
    expect(linked.surveys.map((s) => s.liveId)).toEqual([
      "nectar-2026",
      undefined,
    ]);
  });

  it("carries keys and live ids across a raw JSON edit, including an id edited in place", () => {
    const previous = draftOf(
      survey({ key: "k1", liveId: "nectar-2026" }),
      survey({ key: "k2", id: "b", liveId: "b" }),
    );
    const next = draftOf(
      survey({ key: "t1", id: "renamed" }),
      survey({ key: "t2", id: "b" }),
    );
    const carried = carryOver(previous, next);
    expect(carried.surveys.map((s) => [s.key, s.liveId])).toEqual([
      ["k1", "nectar-2026"],
      ["k2", "b"],
    ]);
  });

  it("gives a duplicate its own key, a new id and no live link", () => {
    const copy = duplicateSurvey(survey({ liveId: "nectar-2026" }));
    expect(copy.id).toBe("nectar-2026-copy");
    expect(copy.status).toBe("draft");
    expect(copy.liveId).toBeUndefined();
  });
});

describe("preview", () => {
  it("can treat every survey as live and fill in a sample link", () => {
    const config = previewConfig(
      draftOf(
        survey({ key: "a", id: "a", status: "draft", url: "" }),
        survey({ key: "b", id: "b", status: "" }),
      ),
      true,
    );
    expect(config.surveys).toMatchObject([
      { status: "live", url: SAMPLE_SURVEY_URL },
      { status: "live", url: "https://example.com/survey" },
    ]);
  });

  it("keeps archived surveys archived when treating surveys as live", () => {
    const config = previewConfig(draftOf(survey({ status: "archived" })), true);
    expect(config.surveys).toMatchObject([{ status: "archived" }]);
  });

  it("uses the draft as it is otherwise", () => {
    const config = previewConfig(draftOf(survey({ status: "draft" })), false);
    expect(config.surveys).toMatchObject([{ status: "draft" }]);
  });

  it("names a draft and an archived survey among the skipped ones", () => {
    const config = previewConfig(
      draftOf(
        survey({ key: "a", id: "a", status: "draft" }),
        survey({ key: "b", id: "b", status: "archived" }),
      ),
      false,
    );
    expect(
      previewOutcome(config, {
        service: "Nectar Dashboard",
        now: NOW,
        preview: false,
        readState: () => ({}),
      }),
    ).toEqual({
      skipped: [
        { id: "a", reason: "a draft, not live" },
        { id: "b", reason: "archived" },
      ],
    });
  });

  it("explains which survey shows and why others do not", () => {
    const config = previewConfig(
      draftOf(
        survey({ id: "", key: "a" }),
        survey({
          key: "b",
          id: "closed",
          opens: "2026-01-01",
          closes: "2026-01-02",
        }),
        survey({ key: "c", id: "shown" }),
        survey({ key: "d", id: "second" }),
      ),
      false,
    );
    expect(
      previewOutcome(config, {
        service: "Nectar Dashboard",
        now: NOW,
        preview: false,
        readState: () => ({}),
      }),
    ).toEqual({
      shownId: "shown",
      skipped: [
        { id: "", reason: "has errors" },
        { id: "closed", reason: "not open on this date" },
        { id: "second", reason: "another survey is shown first" },
      ],
    });
  });
});

describe("preview surveys", () => {
  it("round-trips the preview status through the file", () => {
    const text = toJson(draftOf(survey({ status: "preview" })));
    expect(text).toMatch(/"id": "nectar-2026",\n\s+"status": "preview",/);
    expect(read(text).surveys[0].status).toBe("preview");
  });

  it("warns when a preview survey is open now", () => {
    const open = validate(draftOf(survey({ status: "preview" })), NOW);
    expect(open.warnings).toEqual([
      {
        surveyIndex: 0,
        field: "status",
        message:
          "This survey is open now but still preview only, so only pages opened with ?nectar-survey=preview show it. Set its status to Live to publish it.",
      },
    ]);
    const later = validate(
      draftOf(survey({ status: "preview", opens: "2026-11-01T00:00" })),
      NOW,
    );
    expect(fields(later.warnings)).not.toContain("status");
    const live = validate(draftOf(survey()), NOW);
    expect(fields(live.warnings)).not.toContain("status");
  });

  it("warns when a preview survey has no link", () => {
    const warnings = validate(
      draftOf(survey({ status: "preview", url: "" })),
      NOW,
    ).warnings;
    expect(warnings).toContainEqual({
      surveyIndex: 0,
      field: "url",
      message:
        "This survey is in preview but has no survey link, so the popup does not show it anywhere.",
    });
  });

  it("does not count a preview survey in overlap warnings", () => {
    const draft = draftOf(
      survey({ status: "preview" }),
      survey({ key: "b", id: "other" }),
    );
    expect(fields(validate(draft, NOW).warnings)).toEqual(["status"]);
  });

  it("shows turning preview to live as a changed field", () => {
    const live = draftOf(survey({ status: "preview" }));
    const draft = draftOf(survey({ liveId: "nectar-2026" }));
    expect(diff(live, draft).changes).toEqual([
      {
        surveyId: "nectar-2026",
        field: "status",
        from: "preview",
        to: "live",
      },
    ]);
  });

  it("is listed by the Preview status filter only", () => {
    const filter: SurveyFilter = { search: "", status: "preview" };
    expect(matchesFilter(survey({ status: "preview" }), "open", filter)).toBe(
      true,
    );
    for (const status of ["draft", "live", "archived"] as const) {
      expect(matchesFilter(survey({ status }), "open", filter)).toBe(false);
    }
    expect(
      matchesFilter(survey({ status: "preview" }), "open", DEFAULT_FILTER),
    ).toBe(true);
  });

  it("is turned live in the preview when asked, and skipped otherwise", () => {
    const draft = draftOf(survey({ status: "preview" }));
    const context = {
      service: "Nectar Dashboard",
      now: NOW,
      preview: false,
      readState: () => ({}),
    };
    expect(previewConfig(draft, true).surveys).toMatchObject([
      { status: "live" },
    ]);
    expect(previewOutcome(previewConfig(draft, true), context)).toEqual({
      shownId: "nectar-2026",
      skipped: [],
    });
    expect(previewOutcome(previewConfig(draft, false), context)).toEqual({
      skipped: [
        {
          id: "nectar-2026",
          reason:
            "preview only, shown on pages opened with ?nectar-survey=preview",
        },
      ],
    });
  });
});

describe("previewLink", () => {
  it("adds the preview parameter, and the time when one is set", () => {
    expect(previewLink("https://desktop.rc.nectar.org.au/", "")).toBe(
      "https://desktop.rc.nectar.org.au/?nectar-survey=preview",
    );
    expect(
      previewLink("https://desktop.rc.nectar.org.au/", "2026-10-19T09:00"),
    ).toBe(
      "https://desktop.rc.nectar.org.au/?nectar-survey=preview&nectar-survey-now=2026-10-19T09:00",
    );
  });

  it("keeps an existing query and fragment as they were", () => {
    expect(
      previewLink(
        "https://example.org/page?a=1&b=x%20y#top",
        "2026-10-19T09:00",
      ),
    ).toBe(
      "https://example.org/page?a=1&b=x%20y&nectar-survey=preview&nectar-survey-now=2026-10-19T09:00#top",
    );
    expect(previewLink("https://example.org/page#top", "")).toBe(
      "https://example.org/page?nectar-survey=preview#top",
    );
  });

  it("replaces preview parameters already in the address", () => {
    expect(
      previewLink(
        "https://example.org/?nectar-survey=preview&a=1&nectar-survey-now=2026-01-01",
        "",
      ),
    ).toBe("https://example.org/?a=1&nectar-survey=preview");
  });

  it("is undefined for an address that is not http(s)", () => {
    expect(previewLink("", "")).toBeUndefined();
    expect(previewLink("dashboard.rc.nectar.org.au", "")).toBeUndefined();
    expect(previewLink("ftp://example.org/", "")).toBeUndefined();
  });
});

describe("saved draft", () => {
  const stored = (overrides: Partial<StoredDraft> = {}): StoredDraft => ({
    version: 1,
    savedAt: "2026-10-01T10:00:00.000Z",
    json: toJson(draftOf(survey())),
    liveIds: ["nectar-2026"],
    baseline: "{}",
    source: { kind: "template", at: "2026-10-01T09:00:00.000Z" },
    ...overrides,
  });

  beforeEach(() => localStorage.clear());

  it("saves under its own key and restores the draft with its live ids", () => {
    expect(saveDraft(localStorage, stored({ rawText: "{" }))).toBe(true);
    expect(localStorage.length).toBe(1);
    expect(localStorage.key(0)).toBe(DRAFT_STORAGE_KEY);
    expect(DRAFT_STORAGE_KEY.startsWith("nectar-survey:")).toBe(false);
    const restored = loadDraft(localStorage);
    expect(restored?.stored.rawText).toBe("{");
    expect(restored?.draft.surveys[0]).toMatchObject({
      id: "nectar-2026",
      liveId: "nectar-2026",
      title: "Tell us about your {service} experience",
    });
  });

  it("ignores a missing, damaged or foreign entry", () => {
    expect(loadDraft(localStorage)).toBeNull();
    localStorage.setItem(DRAFT_STORAGE_KEY, "{not json");
    expect(loadDraft(localStorage)).toBeNull();
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ version: 2 }));
    expect(loadDraft(localStorage)).toBeNull();
    saveDraft(localStorage, stored({ json: "{}" }));
    expect(loadDraft(localStorage)).toBeNull();
  });

  it("reports a storage failure instead of throwing", () => {
    const failing = {
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    } as unknown as Storage;
    expect(saveDraft(failing, stored())).toBe(false);
  });
});
