import { expect, test, type Page } from "@playwright/test";

/*
 * Behaviour of the popup on the built demo page, which reads
 * `surveys.demo.json` (survey `nectar-2026`, open 13 October to 14 November
 * 2026 in Australia/Melbourne) and takes the date from `?now=`. Every test
 * gets a fresh browser context, so saved state starts empty.
 */

test.use({ timezoneId: "Australia/Melbourne" });

const SURVEY_ID = "nectar-2026";
const STORAGE_KEY = `nectar-survey:${SURVEY_ID}`;
const TITLE = "Tell us about your Nectar Dashboard experience";
const SURVEY_URL = "https://example.com/nectar-survey";
const TODAY = "2026-10-20T10:00";
const TOMORROW = "2026-10-21T10:00";
const AFTER_CLOSE = "2026-11-15T10:00";
const DIALOG_CHUNK = "**/assets/dialog-*.js";

/** True for a request of the lazily loaded dialog chunk. */
function isDialogChunk(url: string): boolean {
  return /\/assets\/dialog-[^/]+\.js$/.test(new URL(url).pathname);
}

/** Collects the URL of every dialog chunk request the page makes. */
function watchDialogChunk(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (isDialogChunk(request.url())) requests.push(request.url());
  });
  return requests;
}

/** Collects the popup's console warnings. */
function watchWarnings(page: Page): string[] {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "warning" &&
      message.text().startsWith("nectar-survey:")
    ) {
      warnings.push(message.text());
    }
  });
  return warnings;
}

/** Opens the demo at `now` and waits until the popup has decided. */
async function visit(page: Page, now: string = TODAY): Promise<void> {
  await page.goto(`/?now=${encodeURIComponent(now)}`);
  await settled(page);
}

/** Waits for the element's current evaluation to finish. */
async function settled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await customElements.whenDefined("nectar-survey");
    const popup = document.querySelector("nectar-survey") as
      (HTMLElement & { settled: Promise<void> }) | null;
    await popup?.settled;
  });
}

/** The open survey dialog (Playwright locators pierce the shadow root). */
function surveyDialog(page: Page) {
  return page.getByRole("dialog", { name: TITLE });
}

/** Asserts that no dialog is in the page, once any closing fade has ended. */
async function expectNoDialog(page: Page): Promise<void> {
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/**
 * Ticks "Don't show me this again" by clicking its label, as a user does:
 * React Aria keeps the real input visually hidden under the drawn box.
 */
async function tickDontShowAgain(page: Page): Promise<void> {
  const dialog = surveyDialog(page);
  await dialog.getByText("Don't show me this again").click();
  await expect(
    dialog.getByRole("checkbox", { name: "Don't show me this again" }),
  ).toBeChecked();
}

/** The stored state of the demo survey, or null when nothing is stored. */
async function storedState(page: Page): Promise<unknown> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }, STORAGE_KEY);
}

/** Records every `nectar-survey:*` event in `window.surveyEvents`. */
async function recordEvents(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const events: { type: string; surveyId: string }[] = [];
    Object.assign(window, { surveyEvents: events });
    for (const name of ["open", "start", "later", "dismiss"]) {
      document.addEventListener(`nectar-survey:${name}`, (event) => {
        const detail = (event as CustomEvent<{ surveyId: string }>).detail;
        events.push({ type: event.type, surveyId: detail.surveyId });
      });
    }
  });
}

/** The events recorded by `recordEvents`. */
async function recordedEvents(page: Page): Promise<unknown> {
  return page.evaluate(
    () => (window as unknown as { surveyEvents: unknown }).surveyEvents,
  );
}

test("shows the survey inside its dates", async ({ page }) => {
  await visit(page);
  const dialog = surveyDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Nectar research cloud survey")).toBeVisible();
  await expect(
    dialog.getByRole("heading", { level: 2, name: TITLE }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Start survey" }),
  ).toHaveAttribute("href", SURVEY_URL);
  await expect(
    dialog.getByRole("button", { name: "Not right now" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("checkbox", { name: "Don't show me this again" }),
  ).not.toBeChecked();
});

test("does not show before or after the survey dates", async ({ page }) => {
  await visit(page, "2026-10-12T23:59");
  await expectNoDialog(page);
  await visit(page, "2026-11-15T00:00");
  await expectNoDialog(page);
});

test("opens and closes to the minute set in the config", async ({ page }) => {
  await page.route("**/surveys.demo.json", async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    config.surveys[0].opens = "2026-10-13T09:00";
    config.surveys[0].closes = "2026-10-14T17:30";
    await route.fulfill({ response, json: config });
  });
  await visit(page, "2026-10-13T08:59");
  await expectNoDialog(page);
  await visit(page, "2026-10-13T09:00");
  await expect(surveyDialog(page)).toBeVisible();
  // The next day, so the once-a-day rule does not hide it.
  await visit(page, "2026-10-14T17:30");
  await expect(surveyDialog(page)).toBeVisible();
  await visit(page, "2026-10-14T17:31");
  await expectNoDialog(page);
});

test("shows at most once a day", async ({ page }) => {
  await visit(page);
  await expect(surveyDialog(page)).toBeVisible();
  expect(await storedState(page)).toEqual({ shownOn: "2026-10-20" });

  await page.reload();
  await settled(page);
  await expectNoDialog(page);

  await visit(page, TOMORROW);
  await expect(surveyDialog(page)).toBeVisible();
});

test("Start survey opens the survey in a new tab and never shows again", async ({
  page,
  context,
}) => {
  await context.route(`${SURVEY_URL}**`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>Survey</p>" }),
  );
  await visit(page);
  const start = surveyDialog(page).getByRole("link", { name: "Start survey" });
  await expect(start).toHaveAttribute("target", "_blank");
  await expect(start).toHaveAttribute("rel", "noopener noreferrer");

  const [surveyPage] = await Promise.all([
    context.waitForEvent("page"),
    start.click(),
  ]);
  await surveyPage.waitForLoadState();
  expect(surveyPage.url()).toBe(SURVEY_URL);
  await expectNoDialog(page);
  expect(await storedState(page)).toMatchObject({
    clicked: true,
    dismissed: false,
  });

  await visit(page, TOMORROW);
  await expectNoDialog(page);
});

for (const [how, close] of [
  [
    "Not right now",
    (page: Page) =>
      surveyDialog(page).getByRole("button", { name: "Not right now" }).click(),
  ],
  [
    "the close button",
    (page: Page) =>
      surveyDialog(page).getByRole("button", { name: "Close" }).click(),
  ],
  ["Escape", (page: Page) => page.keyboard.press("Escape")],
  // Top left corner of the viewport: on the scrim, outside the panel.
  ["a click on the scrim", (page: Page) => page.mouse.click(4, 4)],
] as const) {
  test(`${how} closes it until tomorrow`, async ({ page }) => {
    await visit(page);
    await expect(surveyDialog(page)).toBeVisible();
    await close(page);
    await expectNoDialog(page);
    expect(await storedState(page)).toEqual({
      shownOn: "2026-10-20",
      dismissed: false,
    });

    await page.reload();
    await settled(page);
    await expectNoDialog(page);

    await visit(page, TOMORROW);
    await expect(surveyDialog(page)).toBeVisible();
  });

  test(`the checkbox and ${how} stop it for good`, async ({ page }) => {
    await visit(page);
    await tickDontShowAgain(page);
    await close(page);
    await expectNoDialog(page);
    expect(await storedState(page)).toMatchObject({ dismissed: true });

    await visit(page, TOMORROW);
    await expectNoDialog(page);
  });
}

test("a click inside the panel does not close it", async ({ page }) => {
  await visit(page);
  await surveyDialog(page).getByText("Leave your email").click();
  await expect(surveyDialog(page)).toBeVisible();
});

test("focus starts inside the dialog and returns afterwards", async ({
  page,
}) => {
  await visit(page);
  const start = surveyDialog(page).getByRole("link", { name: "Start survey" });
  await expect(start).toBeFocused();
  await page.keyboard.press("Escape");
  await expectNoDialog(page);

  // Reopen the popup from a focused control, then close it again: focus
  // goes back to that control.
  const reset = page.getByRole("button", { name: "Reset saved state" });
  await reset.focus();
  await page.keyboard.press("Enter");
  await expect(surveyDialog(page)).toBeVisible();
  await expect(start).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(surveyDialog(page)).toBeHidden();
  await expect(reset).toBeFocused();
});

test("Tab and Shift+Tab stay inside the dialog", async ({ page }) => {
  await visit(page);
  const dialog = surveyDialog(page);
  const inOrder = [
    dialog.getByRole("link", { name: "Start survey" }),
    dialog.getByRole("button", { name: "Not right now" }),
    dialog.getByRole("checkbox", { name: "Don't show me this again" }),
    dialog.getByRole("button", { name: "Close" }),
  ];
  await expect(inOrder[0]).toBeFocused();
  // Two full rounds forward, then one back, so both wrap points are crossed.
  for (let step = 1; step <= inOrder.length * 2; step += 1) {
    await page.keyboard.press("Tab");
    await expect(inOrder[step % inOrder.length]).toBeFocused();
  }
  for (let step = inOrder.length - 1; step >= 0; step -= 1) {
    await page.keyboard.press("Shift+Tab");
    await expect(inOrder[step]).toBeFocused();
  }
});

test("Enter on the focused Start survey link opens the survey", async ({
  page,
  context,
}) => {
  await context.route(`${SURVEY_URL}**`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>Survey</p>" }),
  );
  await visit(page);
  const [surveyPage] = await Promise.all([
    context.waitForEvent("page"),
    page.keyboard.press("Enter"),
  ]);
  await surveyPage.waitForLoadState();
  expect(surveyPage.url()).toBe(SURVEY_URL);
  await expectNoDialog(page);
  expect(await storedState(page)).toMatchObject({ clicked: true });
});

test("gives screen readers the title and the body", async ({ page }) => {
  await visit(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName(TITLE);
  await expect(page.getByRole("heading", { level: 2 })).toHaveAccessibleName(
    TITLE,
  );
  await expect(dialog).toHaveAccessibleDescription(
    /^Nectar research cloud survey We're running a short survey about the Nectar Dashboard, open from 13 October to 14 November\..*\$100 gift cards\.$/,
  );
});

test("fills {service} in the eyebrow", async ({ page }) => {
  await page.route("**/surveys.demo.json", async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    config.surveys[0].eyebrow = "{service} survey";
    await route.fulfill({ response, json: config });
  });
  await visit(page);
  await expect(page.getByRole("dialog")).toHaveAccessibleDescription(
    /^Nectar Dashboard survey We're running/,
  );
});

test.describe("on a 375 by 667 phone screen", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("keeps the panel inside the viewport", async ({ page }) => {
    await visit(page);
    const dialog = surveyDialog(page);
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(box.y + box.height).toBeLessThanOrEqual(667);

    const overflows = await dialog.evaluate((node) => ({
      panel: node.scrollWidth > node.clientWidth,
      page:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    }));
    expect(overflows).toEqual({ panel: false, page: false });
  });
});

test("loads Figtree from assets next to the script", async ({ page }) => {
  const fontResponse = page.waitForResponse((response) =>
    /\/assets\/figtree-[^/]+\.woff2$/.test(new URL(response.url()).pathname),
  );
  await visit(page);
  await expect(surveyDialog(page)).toBeVisible();
  expect((await fontResponse).status()).toBe(200);
  await expect(page.locator("style[data-nectar-survey-fonts]")).toHaveCount(1);
});

test("renders nothing and throws nothing when the config is missing", async ({
  page,
}) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await page.route("**/surveys.demo.json", (route) =>
    route.fulfill({ status: 404, body: "Not found" }),
  );
  await visit(page);
  await expectNoDialog(page);
  expect(errors).toEqual([]);
});

test("renders nothing and throws nothing when the config is not JSON", async ({
  page,
}) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await page.route("**/surveys.demo.json", (route) =>
    route.fulfill({ contentType: "application/json", body: "{ not json" }),
  );
  await visit(page);
  await expectNoDialog(page);
  expect(errors).toEqual([]);
});

test.describe("the dialog chunk", () => {
  test("is not loaded when no survey is due", async ({ page }) => {
    const chunkRequests = watchDialogChunk(page);
    await visit(page, AFTER_CLOSE);
    await expectNoDialog(page);
    expect(chunkRequests).toEqual([]);
  });

  test("is loaded once when a survey is due", async ({ page }) => {
    const chunkRequests = watchDialogChunk(page);
    await visit(page);
    await expect(surveyDialog(page)).toBeVisible();
    expect(chunkRequests).toHaveLength(1);

    // A second showing on the same page reuses the loaded module.
    await page.keyboard.press("Escape");
    await expectNoDialog(page);
    await page.getByRole("button", { name: "Reset saved state" }).click();
    await expect(surveyDialog(page)).toBeVisible();
    expect(chunkRequests).toHaveLength(1);
  });

  test("a refresh while it loads discards the pending showing", async ({
    page,
  }) => {
    let release = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    await page.route(DIALOG_CHUNK, async (route) => {
      await released;
      await route.continue();
    });
    const chunkRequest = page.waitForRequest((request) =>
      isDialogChunk(request.url()),
    );
    await page.goto(`/?now=${encodeURIComponent(TODAY)}`);
    const chunkUrl = (await chunkRequest).url();

    // A new `now` makes the element check again while the chunk is held.
    await page
      .locator("nectar-survey")
      .evaluate((popup, now) => popup.setAttribute("now", now), AFTER_CLOSE);
    await settled(page);
    release();
    // Resolves after the element's own pending import has resumed.
    await page.evaluate(async (url) => {
      await import(url);
    }, chunkUrl);

    await expectNoDialog(page);
    expect(await storedState(page)).toBeNull();
  });

  test("that fails to load shows nothing and keeps the day's showing", async ({
    page,
  }) => {
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    const warnings = watchWarnings(page);
    await page.route(DIALOG_CHUNK, (route) => route.abort());

    await visit(page);
    await expectNoDialog(page);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("could not load the dialog");
    expect(await storedState(page)).toBeNull();
    expect(errors).toEqual([]);

    // The page stays usable.
    const nowControl = page.getByLabel("Pretend the date is");
    await nowControl.click();
    await expect(nowControl).toBeFocused();

    // The browser remembers a failed module import for the life of the
    // page, so the next page load is where the popup tries again.
    await page.unroute(DIALOG_CHUNK);
    await page.reload();
    await settled(page);
    await expect(surveyDialog(page)).toBeVisible();
    expect(await storedState(page)).toEqual({ shownOn: "2026-10-20" });
  });
});

test.describe("events", () => {
  test("open and later", async ({ page }) => {
    await recordEvents(page);
    await visit(page);
    await surveyDialog(page)
      .getByRole("button", { name: "Not right now" })
      .click();
    expect(await recordedEvents(page)).toEqual([
      { type: "nectar-survey:open", surveyId: SURVEY_ID },
      { type: "nectar-survey:later", surveyId: SURVEY_ID },
    ]);
  });

  test("start", async ({ page, context }) => {
    await context.route(`${SURVEY_URL}**`, (route) =>
      route.fulfill({ contentType: "text/html", body: "<p>Survey</p>" }),
    );
    await recordEvents(page);
    await visit(page);
    await Promise.all([
      context.waitForEvent("page"),
      surveyDialog(page).getByRole("link", { name: "Start survey" }).click(),
    ]);
    expect(await recordedEvents(page)).toEqual([
      { type: "nectar-survey:open", surveyId: SURVEY_ID },
      { type: "nectar-survey:start", surveyId: SURVEY_ID },
    ]);
  });

  test("dismiss", async ({ page }) => {
    await recordEvents(page);
    await visit(page);
    await tickDontShowAgain(page);
    await surveyDialog(page)
      .getByRole("button", { name: "Not right now" })
      .click();
    expect(await recordedEvents(page)).toEqual([
      { type: "nectar-survey:open", surveyId: SURVEY_ID },
      { type: "nectar-survey:dismiss", surveyId: SURVEY_ID },
    ]);
  });
});
