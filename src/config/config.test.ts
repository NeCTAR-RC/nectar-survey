import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import surveysJson from "../../public/surveys.example.json?raw";
import {
  escapeHtml,
  fillService,
  parseConfig,
  renderText,
  resolveSurveyUrl,
  sanitiseHtml,
  servicesMatch,
  type Survey,
} from "./config.ts";

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
    startLabel: "Start survey",
    laterLabel: "Not right now",
    dismissLabel: "Don't show me this again",
    ...overrides,
  };
}

/** The smallest raw survey entry that passes validation. */
function rawSurvey(overrides: Record<string, unknown> = {}) {
  return {
    id: "s",
    opens: "2026-10-13",
    closes: "2026-11-14",
    services: "all",
    title: "Title",
    ...overrides,
  };
}

describe("parseConfig", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses the shipped public/surveys.example.json to one disabled survey", () => {
    const surveys = parseConfig(JSON.parse(surveysJson));
    expect(surveys).toHaveLength(1);
    const [s] = surveys;
    expect(s.id).toBe("nectar-2026");
    expect(s.enabled).toBe(false);
    expect(s.opens).toBe("2026-10-13T00:00");
    expect(s.closes).toBe("2026-11-14T23:59");
    expect(s.timezone).toBe("Australia/Melbourne");
    expect(s.services).toBe("all");
    expect(s.eyebrow).toBe("Nectar research cloud survey");
    expect(s.title).toBe("Tell us about your {service} experience");
    expect(s.body).toHaveLength(2);
    expect(s.body[0]).toContain(
      "We're running a short survey about the {service}, open from <strong>13 October to 14 November</strong>.",
    );
    expect(s.body[1]).toContain("<strong>$100 gift cards</strong>");
    expect(s.url).toBe("");
    expect(s.urls).toEqual({ "Nectar Dashboard": "" });
    expect(resolveSurveyUrl(s, "Nectar Dashboard")).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null],
    ["a string", "surveys"],
    ["a number", 42],
    ["an array", [rawSurvey()]],
    ["an object without surveys", { other: [] }],
    ["surveys that is not a list", { surveys: { id: "s" } }],
  ])("returns [] for %s and logs once", (_name, input) => {
    expect(parseConfig(input)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("applies defaults for missing optional keys", () => {
    const [s] = parseConfig({ surveys: [rawSurvey()] });
    expect(s).toEqual({
      id: "s",
      enabled: false,
      archived: false,
      opens: "2026-10-13T00:00",
      closes: "2026-11-14T23:59",
      timezone: "Australia/Melbourne",
      services: "all",
      title: "Title",
      body: [],
      startLabel: "Start survey",
      laterLabel: "Not right now",
      dismissLabel: "Don't show me this again",
    });
  });

  it("reads archived as true only for archived: true", () => {
    const [plain, flagged, odd] = parseConfig({
      surveys: [
        rawSurvey({ id: "a" }),
        rawSurvey({ id: "b", archived: true }),
        rawSurvey({ id: "c", archived: "yes" }),
      ],
    });
    expect(plain.archived).toBe(false);
    expect(flagged.archived).toBe(true);
    expect(odd.archived).toBe(false);
  });

  it("enables a survey only for enabled: true", () => {
    const surveys = parseConfig({
      surveys: [
        rawSurvey({ id: "a", enabled: true }),
        rawSurvey({ id: "b", enabled: "true" }),
      ],
    });
    expect(surveys.map((s) => s.enabled)).toEqual([true, false]);
  });

  it("wraps a single body string in a list", () => {
    const [s] = parseConfig({ surveys: [rawSurvey({ body: "One" })] });
    expect(s.body).toEqual(["One"]);
  });

  it("keeps custom labels and ignores unknown keys", () => {
    const [s] = parseConfig({
      surveys: [
        rawSurvey({
          startLabel: "Go",
          laterLabel: "Later",
          dismissLabel: "Never",
          colour: "red",
        }),
      ],
    });
    expect(s.startLabel).toBe("Go");
    expect(s.laterLabel).toBe("Later");
    expect(s.dismissLabel).toBe("Never");
    expect(s).not.toHaveProperty("colour");
  });

  it("falls back to the default time zone for an unknown one", () => {
    const [s] = parseConfig({
      surveys: [rawSurvey({ timezone: "Mars/Olympus_Mons" })],
    });
    expect(s.timezone).toBe("Australia/Melbourne");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("keeps a valid non-default time zone", () => {
    const [s] = parseConfig({ surveys: [rawSurvey({ timezone: "UTC" })] });
    expect(s.timezone).toBe("UTC");
  });

  it.each([
    ["not an object", "survey"],
    ["missing id", rawSurvey({ id: undefined })],
    ["empty id", rawSurvey({ id: " " })],
    ["missing title", rawSurvey({ title: undefined })],
    ["missing opens", rawSurvey({ opens: undefined })],
    ["badly formatted opens", rawSurvey({ opens: "13/10/2026" })],
    ["impossible closes", rawSurvey({ closes: "2026-11-31" })],
    ["opens with an impossible time", rawSurvey({ opens: "2026-10-13T25:00" })],
    ["closes with seconds", rawSurvey({ closes: "2026-11-14T17:00:00" })],
    ["closes with an offset", rawSurvey({ closes: "2026-11-14T17:00+11:00" })],
    ["opens that is not text", rawSurvey({ opens: 20261013 })],
    ["opens after closes", rawSurvey({ opens: "2026-11-15" })],
    [
      "opens a minute after closes",
      rawSurvey({ opens: "2026-11-14T17:01", closes: "2026-11-14T17:00" }),
    ],
    ["missing services", rawSurvey({ services: undefined })],
    ["empty services", rawSurvey({ services: [] })],
    ["services with an empty name", rawSurvey({ services: ["A", ""] })],
    ["services of the wrong type", rawSurvey({ services: "Nectar Dashboard" })],
    ["body with a non-string entry", rawSurvey({ body: ["One", 2] })],
    ["body of the wrong type", rawSurvey({ body: { text: "One" } })],
  ])("drops a survey with %s and logs once", (_name, entry) => {
    const surveys = parseConfig({ surveys: [entry, rawSurvey({ id: "ok" })] });
    expect(surveys.map((s) => s.id)).toEqual(["ok"]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("accepts a date and time as written and a date alone as whole days", () => {
    const [timed, dated] = parseConfig({
      surveys: [
        rawSurvey({
          id: "timed",
          opens: "2026-10-13T09:00",
          closes: "2026-11-14T17:30",
        }),
        rawSurvey({ id: "dated" }),
      ],
    });
    expect([timed.opens, timed.closes]).toEqual([
      "2026-10-13T09:00",
      "2026-11-14T17:30",
    ]);
    expect([dated.opens, dated.closes]).toEqual([
      "2026-10-13T00:00",
      "2026-11-14T23:59",
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("accepts a date and time beside a date alone", () => {
    const [s] = parseConfig({
      surveys: [rawSurvey({ opens: "2026-11-14T09:00", closes: "2026-11-14" })],
    });
    expect([s.opens, s.closes]).toEqual([
      "2026-11-14T09:00",
      "2026-11-14T23:59",
    ]);
  });

  it("accepts opens equal to closes, a window of one minute", () => {
    const [s] = parseConfig({
      surveys: [
        rawSurvey({ opens: "2026-10-13T09:00", closes: "2026-10-13T09:00" }),
      ],
    });
    expect(s.opens).toBe(s.closes);
    expect(warn).not.toHaveBeenCalled();
  });

  it("explains a bad opens value with an example of the form", () => {
    parseConfig({ surveys: [rawSurvey({ opens: "2026-10-13T25:00" })] });
    expect(warn).toHaveBeenCalledWith(
      'nectar-survey: survey "s" skipped: opens must be a date, or a date and time, such as 2026-10-13T09:00',
    );
  });

  it("keeps config order", () => {
    const surveys = parseConfig({
      surveys: [rawSurvey({ id: "b" }), rawSurvey({ id: "a" })],
    });
    expect(surveys.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("keeps only string values in urls", () => {
    const [s] = parseConfig({
      surveys: [rawSurvey({ urls: { A: "https://a.example", B: 5 } })],
    });
    expect(s.urls).toEqual({ A: "https://a.example" });
  });

  it("escapes all markup in the title", () => {
    const [s] = parseConfig({
      surveys: [rawSurvey({ title: "Your <strong>{service}</strong> & us" })],
    });
    expect(s.title).toBe(
      "Your &lt;strong&gt;{service}&lt;/strong&gt; &amp; us",
    );
  });

  it("sanitises body paragraphs", () => {
    const [s] = parseConfig({
      surveys: [rawSurvey({ body: ["<em>Hi</em><script>x()</script>"] })],
    });
    expect(s.body).toEqual(["<em>Hi</em>&lt;script&gt;x()&lt;/script&gt;"]);
  });
});

describe("resolveSurveyUrl", () => {
  it("prefers the per-service url", () => {
    const s = survey({
      url: "https://shared.example/",
      urls: { "Nectar Dashboard": "https://dashboard.example/" },
    });
    expect(resolveSurveyUrl(s, "Nectar Dashboard")).toBe(
      "https://dashboard.example/",
    );
  });

  it("falls back to the shared url when the service has no usable entry", () => {
    const s = survey({
      url: "https://shared.example/",
      urls: { "Nectar Dashboard": "", Other: "https://other.example/" },
    });
    expect(resolveSurveyUrl(s, "Nectar Dashboard")).toBe(
      "https://shared.example/",
    );
    expect(resolveSurveyUrl(s, "Unlisted")).toBe("https://shared.example/");
  });

  it("returns undefined when neither url is usable", () => {
    expect(resolveSurveyUrl(survey(), "Nectar Dashboard")).toBeUndefined();
    expect(
      resolveSurveyUrl(survey({ url: "" }), "Nectar Dashboard"),
    ).toBeUndefined();
  });

  it.each([
    "javascript:alert(1)",
    " JavaScript:alert(1)",
    "data:text/html,<b>x</b>",
    "ftp://example.org/",
    "mailto:someone@example.org",
    "/relative/path",
    "example.org/survey",
  ])("rejects %j", (url) => {
    expect(
      resolveSurveyUrl(
        survey({ url, urls: { "Nectar Dashboard": url } }),
        "Nectar Dashboard",
      ),
    ).toBeUndefined();
  });

  it("accepts http and https", () => {
    expect(resolveSurveyUrl(survey({ url: "http://example.org/s" }), "X")).toBe(
      "http://example.org/s",
    );
    expect(
      resolveSurveyUrl(survey({ url: "https://example.org/s?a=1&b=2" }), "X"),
    ).toBe("https://example.org/s?a=1&b=2");
  });

  it("does not treat inherited object keys as services", () => {
    const s = survey({ url: "https://shared.example/", urls: {} });
    expect(resolveSurveyUrl(s, "constructor")).toBe("https://shared.example/");
    expect(resolveSurveyUrl(s, "__proto__")).toBe("https://shared.example/");
  });
});

describe("servicesMatch", () => {
  it('matches everything for "all"', () => {
    expect(servicesMatch(survey({ services: "all" }), "Anything")).toBe(true);
  });

  it("matches listed names exactly", () => {
    const s = survey({
      services: ["Nectar Dashboard", "ARDC BinderHub Service"],
    });
    expect(servicesMatch(s, "Nectar Dashboard")).toBe(true);
    expect(servicesMatch(s, "ARDC BinderHub Service")).toBe(true);
    expect(servicesMatch(s, "nectar dashboard")).toBe(false);
    expect(servicesMatch(s, "Nectar")).toBe(false);
    expect(servicesMatch(s, "")).toBe(false);
  });
});

describe("fillService", () => {
  it("replaces every placeholder as plain text, without escaping", () => {
    expect(fillService("{service} & {service}", "A & B")).toBe("A & B & A & B");
    expect(fillService("No placeholder", "X")).toBe("No placeholder");
  });
});

describe("renderText", () => {
  it("replaces every placeholder", () => {
    expect(renderText("{service} and {service}", "Nectar Dashboard")).toBe(
      "Nectar Dashboard and Nectar Dashboard",
    );
  });

  it("leaves text without placeholders unchanged", () => {
    expect(renderText("No placeholder", "X")).toBe("No placeholder");
  });

  it("escapes the service name so it is never HTML", () => {
    expect(renderText("<em>{service}</em>", '<img src=x onerror="a()">')).toBe(
      "<em>&lt;img src=x onerror=&quot;a()&quot;&gt;</em>",
    );
  });

  it("does not expand replacement patterns in the service name", () => {
    expect(renderText("a {service} b", "$& $1 $$")).toBe("a $&amp; $1 $$ b");
  });
});

describe("escapeHtml", () => {
  it("escapes the HTML special characters", () => {
    expect(escapeHtml(`<a href="x">&</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;",
    );
  });
});

describe("sanitiseHtml", () => {
  /** Parses sanitised output the way the dialog will, via innerHTML. */
  function render(html: string): HTMLElement {
    const p = document.createElement("p");
    p.innerHTML = sanitiseHtml(html);
    return p;
  }

  it("keeps plain text and escapes special characters", () => {
    expect(sanitiseHtml("Fish & chips > 5")).toBe("Fish &amp; chips &gt; 5");
  });

  it("keeps strong and em, including nested", () => {
    expect(sanitiseHtml("<strong>a <em>b</em></strong> c")).toBe(
      "<strong>a <em>b</em></strong> c",
    );
  });

  it("drops attributes from strong and em", () => {
    expect(
      sanitiseHtml(
        '<strong onclick="x()" class="c" style="color:red">a</strong>',
      ),
    ).toBe("<strong>a</strong>");
  });

  it("keeps http(s) links and adds rel and target", () => {
    expect(
      sanitiseHtml(
        '<a href="https://example.org/a?b=1&amp;c=2" title="t">go</a>',
      ),
    ).toBe(
      '<a href="https://example.org/a?b=1&amp;c=2" rel="noopener" target="_blank">go</a>',
    );
  });

  it("drops event handlers from links", () => {
    const html = sanitiseHtml(
      '<a href="https://example.org/" onclick="x()" onmouseover="y()">go</a>',
    );
    expect(html).not.toMatch(/onclick|onmouseover/);
    expect(render(html).querySelector("a")?.getAttributeNames().sort()).toEqual(
      ["href", "rel", "target"],
    );
  });

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "/relative",
    "",
  ])("shows a link with href %j as text", (href) => {
    const p = render(`<a href="${href}">go</a>`);
    expect(p.querySelector("a")).toBeNull();
    expect(p.childElementCount).toBe(0);
  });

  it("shows a link without href as text", () => {
    expect(render("<a>go</a>").childElementCount).toBe(0);
  });

  it("shows script tags as text", () => {
    const p = render("Hi <script>alert(1)</script>");
    expect(p.querySelector("script")).toBeNull();
    expect(p.textContent).toBe("Hi <script>alert(1)</script>");
  });

  it("shows other elements with event handlers as text", () => {
    const p = render(
      '<img src="x" onerror="alert(1)"><div onclick="x()">d</div>',
    );
    expect(p.childElementCount).toBe(0);
    expect(p.textContent).toContain("<img");
  });

  it("shows style, iframe, svg and nested disallowed markup as text", () => {
    const p = render(
      '<style>*{}</style><iframe src="https://x"></iframe><svg onload="x()"></svg><span><strong>s</strong></span>',
    );
    expect(p.childElementCount).toBe(0);
  });

  it("closes unclosed tags", () => {
    expect(sanitiseHtml("<strong>open")).toBe("<strong>open</strong>");
    expect(sanitiseHtml("<em><strong>two")).toBe(
      "<em><strong>two</strong></em>",
    );
  });

  it("handles malformed markup safely", () => {
    for (const input of [
      "<scr<script>ipt>alert(1)</script>",
      '<a href="https://x"<script>alert(1)</script>',
      "<<strong>>x",
      '"><img src=x onerror=alert(1)>',
      "<!-- <script>alert(1)</script> -->text",
      "</strong>stray close",
    ]) {
      const p = render(input);
      expect(p.querySelector("script, img, [onerror], [onclick]")).toBeNull();
      for (const el of Array.from(p.querySelectorAll("*"))) {
        expect(["strong", "em", "a"]).toContain(el.localName);
      }
    }
  });

  it("removes comments", () => {
    expect(sanitiseHtml("a<!-- hidden -->b")).toBe("ab");
  });

  it("is stable when applied twice", () => {
    const once = sanitiseHtml(
      '<strong>a</strong> <a href="https://x.example/">l</a> <b>b</b> &amp;',
    );
    expect(sanitiseHtml(once)).toBe(once);
  });
});
