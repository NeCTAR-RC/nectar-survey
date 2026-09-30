import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

/*
 * The config editor (`editor.html`) on the built output. `vite preview`
 * serves no `surveys.json`, so the page starts with "nothing published yet"
 * and every test loads the shipped template; no network is needed. Every
 * test gets a fresh browser context, so the saved draft starts empty.
 */

test.use({ timezoneId: "Australia/Melbourne" });

const TEMPLATE_TITLE = "Tell us about your {service} experience";

/** Opens the editor and starts from the template. */
async function openTemplate(page: Page): Promise<void> {
  await page.goto("/editor.html");
  await expect(
    page.getByText("Nothing is published yet").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start from template" }).click();
  await expect(page.getByText(/Started from the template/)).toBeVisible();
}

function titleField(page: Page) {
  return page.getByRole("textbox", { name: /^Title/ });
}

function downloadButton(page: Page) {
  return page.getByRole("button", { name: "Download surveys.json" });
}

function summary(page: Page) {
  return page.getByTestId("summary");
}

async function openTab(page: Page, name: RegExp | string): Promise<void> {
  await page.getByRole("tab", { name }).click();
}

/** The survey list pane. */
function nav(page: Page) {
  return page.getByRole("complementary", { name: "Surveys" });
}

/** The list's row for the survey with `id`; it starts with its position. */
function row(page: Page, id: string) {
  return nav(page).getByRole("button", {
    name: new RegExp(`^\\d+ ${id}\\b`),
  });
}

/** Opens the Filters accordion, which starts closed. */
async function openFilters(page: Page): Promise<void> {
  await nav(page).getByRole("button", { name: "Filters", exact: true }).click();
}

/** One chip of a filter group, by its words; Filters must be open. */
function chip(page: Page, name: string) {
  return nav(page).getByRole("row", { name, exact: true });
}

/** The caption over the selected survey's row when it does not match. */
function outsideCaption(page: Page) {
  return nav(page).getByText("Selected, outside the filter", { exact: true });
}

function countLine(page: Page) {
  return nav(page).getByText(/^\d+ of \d+ match$/);
}

/** The shown survey's form, named by its heading, the id. */
function surveyForm(page: Page, id: string) {
  return page.getByRole("region", { name: id, exact: true });
}

/** Every survey form on the page; only the selected survey has one. */
function surveyForms(page: Page) {
  return page.locator(".editor-form").getByRole("region");
}

/** Replaces the template survey's dates with ones in January 2026. */
async function closeTemplateSurvey(page: Page): Promise<void> {
  await openTab(page, /^JSON$/);
  const raw = page.getByRole("textbox", { name: "surveys.json" });
  await raw.fill(
    (await raw.inputValue())
      .replace('"opens": "2026-10-13T00:00"', '"opens": "2026-01-01T00:00"')
      .replace('"closes": "2026-11-14T23:59"', '"closes": "2026-01-02T23:59"'),
  );
}

test("the start screen explains the four ways to start", async ({ page }) => {
  await page.goto("/editor.html");
  await expect(page.getByText("Choose where to start.")).toBeVisible();
  const cards = [
    [
      "Load the live file",
      // The preview server has no surveys.json, so the live card says so.
      "The surveys.json the services are using right now. Edit it to change what users see. None is published yet, so there is nothing to load: start from the template or open a file.",
      "Load live",
    ],
    [
      "Open a file",
      "A surveys.json saved on this computer, for example one you downloaded earlier. You can also drop the file anywhere on this page.",
      "Open file",
    ],
    [
      "Paste JSON",
      "Text copied from somewhere else, such as a chat message or an email.",
      "Paste JSON",
    ],
    [
      "Start from the template",
      "One disabled survey with the standard wording. Use it for the first survey, or to start over.",
      "Start from template",
    ],
  ] as const;
  for (const [title, description, action] of cards) {
    const card = page.getByRole("listitem").filter({
      has: page.getByRole("heading", { name: title, exact: true }),
    });
    await expect(card.getByText(description)).toBeVisible();
    await expect(card.getByRole("button", { name: action })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Load live" })).toBeDisabled();
});

test("loads the template into the form with no problems", async ({ page }) => {
  await openTemplate(page);
  await expect(page.getByRole("textbox", { name: /^Id/ })).toHaveValue(
    "nectar-2026",
  );
  await expect(titleField(page)).toHaveValue(TEMPLATE_TITLE);
  await expect(summary(page)).toHaveText("No problems found.");
  await expect(downloadButton(page)).toBeEnabled();
});

test("editing the title updates the warning list", async ({ page }) => {
  await openTemplate(page);
  await titleField(page).fill("Tell us what you think");
  await expect(summary(page)).toHaveText("0 errors and 1 warning.");
  await openTab(page, /^Problems/);
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByText(/has no \{service\} placeholder/)).toBeVisible();

  await panel.getByRole("button", { name: "nectar-2026, Title" }).click();
  await expect(titleField(page)).toBeFocused();

  await titleField(page).fill("About {service}");
  await expect(summary(page)).toHaveText("No problems found.");
});

test("download stays off while there is an error and says why", async ({
  page,
}) => {
  await openTemplate(page);
  await titleField(page).fill("");
  await expect(summary(page)).toHaveText("1 error and 0 warnings.");
  await expect(downloadButton(page)).toBeDisabled();
  await expect(
    page.getByText("Fix 1 error first. The Problems tab lists them."),
  ).toBeVisible();
  await expect(page.getByText("Enter a title.").first()).toBeVisible();

  await titleField(page).fill("Your {service}");
  await expect(downloadButton(page)).toBeEnabled();
});

test("downloads the draft as surveys.json", async ({ page }) => {
  await openTemplate(page);
  await titleField(page).fill("How was {service}?");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadButton(page).click(),
  ]);
  expect(download.suggestedFilename()).toBe("surveys.json");
  const text = await readFile(await download.path(), "utf8");
  expect(text.endsWith("}\n")).toBe(true);
  expect(text).toContain('\n  "surveys": [\n    {\n      "id": "nectar-2026",');
  const json = JSON.parse(text);
  expect(json.surveys[0].title).toBe("How was {service}?");
  expect(json.surveys[0].enabled).toBe(false);
  expect(Object.keys(json.surveys[0])).toEqual([
    "id",
    "enabled",
    "opens",
    "closes",
    "timezone",
    "services",
    "eyebrow",
    "title",
    "body",
    "startLabel",
    "laterLabel",
    "dismissLabel",
  ]);
  await expect(page.getByText("Up to date", { exact: true })).toBeVisible();
});

test("raw JSON and the form stay in step both ways", async ({ page }) => {
  await openTemplate(page);
  await titleField(page).fill("From the form {service}");
  await openTab(page, /^JSON$/);
  const raw = page.getByRole("textbox", { name: "surveys.json" });
  await expect(raw).toHaveValue(/"title": "From the form \{service\}"/);

  const text = await raw.inputValue();
  await raw.fill(text.replace("From the form", "From the JSON"));
  await expect(titleField(page)).toHaveValue("From the JSON {service}");

  await raw.fill('{\n  "surveys": [\n    }');
  await expect(page.getByText(/^Line 3, column 5: /)).toBeVisible();
  await expect(page.getByText(/The form is paused/)).toBeVisible();
  await expect(page.locator(".survey-nav")).toHaveAttribute("inert", "");
  await expect(page.locator(".editor-work")).toHaveAttribute("inert", "");
  await expect(downloadButton(page)).toBeDisabled();

  await raw.fill(text);
  await expect(page.getByText(/The form is paused/)).toHaveCount(0);
  await expect(titleField(page)).toHaveValue("From the form {service}");
});

test("All services follows the service boxes and drives them", async ({
  page,
}) => {
  await openTemplate(page);
  const group = page.getByRole("group", { name: "Show this survey on" });
  const all = group.getByRole("checkbox", { name: "All services" });
  const dashboard = group.getByRole("checkbox", { name: "Nectar Dashboard" });
  const raw = page.getByRole("textbox", { name: "surveys.json" });
  // The library hides the native inputs, so the labels are what gets clicked.
  const toggle = (name: string) =>
    group.getByText(name, { exact: true }).click();

  // The template is for all services.
  await openTab(page, /^JSON$/);
  await expect(all).toBeChecked();
  await expect(raw).toHaveValue(/"services": "all"/);

  // Unticking one turns All services off, and the file lists the other three.
  await toggle("Nectar Dashboard");
  await expect(dashboard).not.toBeChecked();
  await expect(all).not.toBeChecked();
  await expect(raw).not.toHaveValue(/"services": "all"/);
  await expect(raw).toHaveValue(
    /"services": \[\n\s+"ARDC Jupyter Notebook Service",\n\s+"ARDC BinderHub Service",\n\s+"ARDC Virtual Desktop Service"\n\s+\]/,
  );

  // Ticking it back completes the set: All services goes on again.
  await toggle("Nectar Dashboard");
  await expect(all).toBeChecked();
  await expect(raw).toHaveValue(/"services": "all"/);

  // Unticking another while All services is on turns it off again.
  await toggle("ARDC BinderHub Service");
  await expect(all).not.toBeChecked();
  await expect(raw).not.toHaveValue(/"services": "all"/);

  // All services ticks every service, and unticking it clears them.
  await toggle("All services");
  for (const name of [
    "Nectar Dashboard",
    "ARDC Jupyter Notebook Service",
    "ARDC BinderHub Service",
    "ARDC Virtual Desktop Service",
  ]) {
    await expect(group.getByRole("checkbox", { name })).toBeChecked();
  }
  await expect(raw).toHaveValue(/"services": "all"/);
  await toggle("All services");
  await expect(dashboard).not.toBeChecked();
  await expect(all).not.toBeChecked();
});

test("a service name typed in one survey is offered in every survey and the filter", async ({
  page,
}) => {
  await openTemplate(page);
  // A new survey is for all services, and still offers another name.
  await nav(page).getByRole("button", { name: "Add survey" }).click();
  const form = surveyForm(page, "survey-1");
  const group = form.getByRole("group", { name: "Show this survey on" });
  await expect(
    group.getByRole("checkbox", { name: "All services" }),
  ).toBeChecked();
  await form.getByRole("button", { name: "Add another service name" }).click();
  await form
    .getByRole("textbox", { name: "Other service name 1" })
    .fill("ARDC Research Data Service");
  // Typed while All services is on, it is ticked like the rest.
  await expect(
    group.getByRole("checkbox", { name: "ARDC Research Data Service" }),
  ).toBeChecked();
  await expect(
    group.getByRole("checkbox", { name: "All services" }),
  ).toBeChecked();

  // The second survey offers it as a box of its own.
  await nav(page).getByRole("button", { name: "Add survey" }).click();
  await expect(
    surveyForm(page, "survey-2")
      .getByRole("group", { name: "Show this survey on" })
      .getByRole("checkbox", { name: "ARDC Research Data Service" }),
  ).toBeVisible();

  // And so does the list's Service filter.
  await openFilters(page);
  await nav(page)
    .getByRole("button", { name: /Service/ })
    .click();
  await expect(
    page.getByRole("option", { name: "ARDC Research Data Service" }),
  ).toBeVisible();
});

test("the list shows one row per survey and a row shows its form", async ({
  page,
}) => {
  await openTemplate(page);
  await nav(page).getByRole("button", { name: "Add survey" }).click();
  await nav(page).getByRole("button", { name: "Add survey" }).click();
  await expect(nav(page).getByRole("listitem")).toHaveCount(3);
  await expect(countLine(page)).toHaveText("3 of 3 match");

  // A new survey is selected straight away, and its form is the only one.
  await expect(row(page, "survey-2")).toHaveAttribute("aria-current", "true");
  await expect(surveyForm(page, "survey-2")).toBeVisible();
  await expect(surveyForms(page)).toHaveCount(1);
  await expect(row(page, "survey-2")).toContainText("No title yet");
  await expect(row(page, "survey-2")).toContainText("3 errors");

  await row(page, "nectar-2026").click();
  await expect(row(page, "nectar-2026")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(row(page, "survey-2")).not.toHaveAttribute("aria-current");
  await expect(surveyForm(page, "nectar-2026")).toBeVisible();
  await expect(titleField(page)).toHaveValue(TEMPLATE_TITLE);
});

test("a chosen filter lists only matching surveys but keeps the selected one", async ({
  page,
}) => {
  // Before the template survey opens, so it is upcoming.
  await page.clock.setFixedTime(new Date("2026-10-01T10:00:00+10:00"));
  await openTemplate(page);
  await nav(page).getByRole("button", { name: "Add survey" }).click();
  await nav(page).getByRole("button", { name: "Add survey" }).click();
  await row(page, "nectar-2026").click();
  await expect(row(page, "nectar-2026")).toContainText("Upcoming");
  await expect(outsideCaption(page)).toHaveCount(0);

  // No survey is closed, so nothing matches; the selected one stays listed
  // and shown under a caption, and the count leaves it out.
  await expect(chip(page, "Closed")).toBeHidden();
  await openFilters(page);
  await chip(page, "Closed").click();
  await expect(chip(page, "Closed")).toHaveAttribute("aria-selected", "true");
  await expect(countLine(page)).toHaveText("0 of 3 match");
  await expect(nav(page).getByRole("listitem")).toHaveCount(1);
  await expect(row(page, "nectar-2026")).toBeVisible();
  await expect(outsideCaption(page)).toBeVisible();
  await expect(surveyForm(page, "nectar-2026")).toBeVisible();

  // Editing the dates into the past makes it match: the caption goes and
  // nothing moves.
  await closeTemplateSurvey(page);
  await expect(countLine(page)).toHaveText("1 of 3 match");
  await expect(outsideCaption(page)).toHaveCount(0);
  await expect(row(page, "nectar-2026")).toContainText("Closed");
  await expect(surveyForm(page, "nectar-2026")).toBeVisible();

  // Choosing the chip again clears it; Clear filters resets every group.
  await chip(page, "Closed").click();
  await expect(countLine(page)).toHaveText("3 of 3 match");
  await chip(page, "Disabled").click();
  await expect(countLine(page)).toHaveText("3 of 3 match");
  await chip(page, "Enabled").click();
  await expect(countLine(page)).toHaveText("0 of 3 match");
  await nav(page).getByRole("button", { name: "Clear filters" }).click();
  await expect(countLine(page)).toHaveText("3 of 3 match");
  await expect(
    nav(page).getByRole("button", { name: "Clear filters" }),
  ).toHaveCount(0);
});

test("Would show now lists what the popup would show and sets three groups", async ({
  page,
}) => {
  // Inside the template's dates, so the template survey is open now.
  await page.clock.setFixedTime(new Date("2026-10-20T10:00:00+11:00"));
  await openTemplate(page);
  await openTab(page, /^JSON$/);
  const raw = page.getByRole("textbox", { name: "surveys.json" });
  await raw.fill(
    (await raw.inputValue()).replace('"enabled": false', '"enabled": true'),
  );
  await nav(page).getByRole("button", { name: "Add survey" }).click();
  await row(page, "nectar-2026").click();

  await openFilters(page);
  await chip(page, "Would show now").click();
  await expect(countLine(page)).toHaveText("1 of 2 match");
  await expect(row(page, "nectar-2026")).toBeVisible();
  await expect(row(page, "survey-1")).toHaveCount(0);
  for (const name of ["Would show now", "Open now", "Enabled", "Current"]) {
    await expect(chip(page, name)).toHaveAttribute("aria-selected", "true");
  }

  // Choosing it again clears all three groups to any.
  await chip(page, "Would show now").click();
  await expect(countLine(page)).toHaveText("2 of 2 match");
  for (const name of ["Would show now", "Open now", "Enabled", "Current"]) {
    await expect(chip(page, name)).toHaveAttribute("aria-selected", "false");
  }
});

test("the search finds surveys by id", async ({ page }) => {
  await openTemplate(page);
  await nav(page).getByRole("button", { name: "Add survey" }).click();
  await nav(page).getByRole("button", { name: "Add survey" }).click();
  await row(page, "nectar-2026").click();

  await nav(page)
    .getByRole("searchbox", { name: "Find a survey" })
    .fill("SURVEY-1");
  await expect(countLine(page)).toHaveText("1 of 3 match");
  await expect(row(page, "survey-1")).toBeVisible();
  await expect(row(page, "survey-2")).toHaveCount(0);
  // The selected survey stays listed although it does not match.
  await expect(row(page, "nectar-2026")).toBeVisible();

  await nav(page)
    .getByRole("searchbox", { name: "Find a survey" })
    .fill("no such survey");
  await expect(countLine(page)).toHaveText("0 of 3 match");
  await expect(nav(page).getByRole("listitem")).toHaveCount(1);
});

test("a Problems link shows its survey and focuses the field", async ({
  page,
}) => {
  await openTemplate(page);
  await nav(page).getByRole("button", { name: "Add survey" }).click();
  await row(page, "nectar-2026").click();
  await expect(surveyForm(page, "nectar-2026")).toBeVisible();

  await openTab(page, /^Problems/);
  await page
    .getByRole("tabpanel")
    .getByRole("button", { name: "survey-1, Title" })
    .click();
  await expect(surveyForm(page, "survey-1")).toBeVisible();
  await expect(row(page, "survey-1")).toHaveAttribute("aria-current", "true");
  await expect(titleField(page)).toBeFocused();
  await expect(titleField(page)).toHaveValue("");
});

test("a closed survey suggests archiving; the Archived chip lists archived surveys", async ({
  page,
}) => {
  await openTemplate(page);
  const survey = surveyForm(page, "nectar-2026");

  // Closing the survey by editing its dates moves nothing: it stays where it
  // is, with a Closed badge and a note that suggests archiving.
  await closeTemplateSurvey(page);
  const raw = page.getByRole("textbox", { name: "surveys.json" });
  await expect(survey.getByText("Closed", { exact: true })).toBeVisible();
  await expect(survey.getByText(/This survey has closed/)).toBeVisible();
  await expect(summary(page)).toHaveText("No problems found.");

  // Archive writes it to the file; it stays shown while it is selected,
  // although the default Current chip no longer counts it.
  await survey
    .getByRole("button", { name: "Archive nectar-2026" })
    .first()
    .click();
  await expect(raw).toHaveValue(/"archived": true/);
  await expect(survey).toBeVisible();
  await expect(survey.getByText(/This survey has closed/)).toHaveCount(0);
  await expect(row(page, "nectar-2026")).toContainText("Archived");
  await expect(countLine(page)).toHaveText("0 of 1 match");
  const removeArchived = nav(page).getByRole("button", {
    name: "Remove archived surveys",
  });
  await expect(removeArchived).toHaveCount(0);

  // The Archived chip lists it and offers to remove archived surveys.
  await openFilters(page);
  await chip(page, "Archived").click();
  await expect(countLine(page)).toHaveText("1 of 1 match");
  await expect(removeArchived).toBeVisible();

  // Unarchive brings it back; Remove archived surveys empties the draft.
  await survey.getByRole("button", { name: "Unarchive nectar-2026" }).click();
  await expect(raw).not.toHaveValue(/"archived"/);
  await expect(removeArchived).toHaveCount(0);
  await survey
    .getByRole("button", { name: "Archive nectar-2026" })
    .first()
    .click();
  await removeArchived.click();
  await page
    .getByRole("alertdialog", { name: "Remove 1 archived survey?" })
    .getByRole("button", { name: "Remove archived surveys" })
    .click();
  await expect(
    nav(page).getByText(
      "No surveys yet. Add a survey, or use Load to replace the draft.",
    ),
  ).toBeVisible();
  await expect(surveyForms(page)).toHaveCount(0);
  await expect(raw).toHaveValue(/"surveys": \[\]/);
});

test("a date can be typed one segment at a time", async ({ page }) => {
  await openTemplate(page);
  const opens = page.getByRole("group", { name: /^Opens/ });
  await opens.getByRole("spinbutton", { name: "day" }).click();
  await page.keyboard.type("2");
  await page.keyboard.press("Tab");
  await page.keyboard.type("10");
  await page.keyboard.type("2026");
  await expect(opens.getByRole("spinbutton", { name: "day" })).toHaveText("02");
  await expect(opens.getByRole("spinbutton", { name: "month" })).toHaveText(
    "10",
  );
  await expect(opens.getByRole("spinbutton", { name: "year" })).toHaveText(
    "2026",
  );

  await openTab(page, /^JSON$/);
  const raw = page.getByRole("textbox", { name: "surveys.json" });
  await expect(raw).toHaveValue(/"opens": "2026-10-02T00:00"/);
});

test("Opens has date and time segments and a typed time reaches the JSON", async ({
  page,
}) => {
  await openTemplate(page);
  const opens = page.getByRole("group", { name: /^Opens/ });
  for (const name of ["day", "month", "year", "hour", "minute"]) {
    await expect(opens.getByRole("spinbutton", { name })).toBeVisible();
  }
  await opens.getByRole("spinbutton", { name: "hour" }).click();
  await page.keyboard.type("9");
  await page.keyboard.type("30");
  await expect(opens.getByRole("spinbutton", { name: "hour" })).toHaveText("9");
  await expect(opens.getByRole("spinbutton", { name: "minute" })).toHaveText(
    "30",
  );

  await openTab(page, /^JSON$/);
  const raw = page.getByRole("textbox", { name: "surveys.json" });
  await expect(raw).toHaveValue(/"opens": "2026-10-13T09:30"/);
});

test("no browser-zone hint when the browser counts time in the survey's zone", async ({
  page,
}) => {
  await openTemplate(page);
  await expect(page.getByText(/^In your time zone/)).toHaveCount(0);
});

test.describe("in a browser in Perth", () => {
  test.use({ timezoneId: "Australia/Perth" });

  test("Opens and Closes say what the Melbourne times mean in Perth", async ({
    page,
  }) => {
    await openTemplate(page);
    // 00:00 AEDT (UTC+11) on 13 Oct is 21:00 AWST (UTC+8) the day before.
    // React Aria puts the selected date first in the description.
    await expect(
      page.getByRole("group", { name: /^Opens/ }),
    ).toHaveAccessibleDescription(
      /In your time zone \(Australia\/Perth\): 9:00 pm, Monday 12 October 2026\.$/,
    );
    await expect(
      page.getByText(
        "In your time zone (Australia/Perth): 8:59 pm, Saturday 14 November 2026.",
      ),
    ).toBeVisible();
  });
});

test("opens a local file", async ({ page }) => {
  await page.goto("/editor.html");
  await page.locator('input[type="file"]').setInputFiles({
    name: "my-surveys.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ surveys: [{ id: "from-file", title: "T {service}" }] }),
    ),
  });
  await expect(page.getByText(/Opened my-surveys\.json/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Id/ })).toHaveValue(
    "from-file",
  );
});

test("the preview mounts the real popup with the draft", async ({ page }) => {
  // Inside the template's survey dates, so the popup has something to show.
  await page.clock.setFixedTime(new Date("2026-10-20T10:00:00+11:00"));
  await openTemplate(page);
  await titleField(page).fill("Preview of {service}");
  await openTab(page, "Preview");
  await page.getByRole("button", { name: "Show popup" }).click();

  const title = "Preview of Nectar Dashboard";
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  const inShadowRoot = await page.evaluate((name) => {
    const element = document.querySelector("nectar-survey");
    const found = element?.shadowRoot?.querySelector('[role="dialog"]');
    return found?.textContent?.includes(name) ?? false;
  }, title);
  expect(inShadowRoot).toBe(true);
  await expect(page.getByText('The popup shows "nectar-2026".')).toBeVisible();

  await dialog.getByRole("button", { name: "Not right now" }).click();
  await expect(dialog).toHaveCount(0);
  const log = page.getByRole("region", { name: "Popup events" });
  await expect(log.getByText(/later/)).toBeVisible();
  await expect(log.getByText(/open/)).toBeVisible();

  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toContain("nectar-survey:nectar-2026");
  expect(keys).toContain("nectar-survey-editor:draft");
});

test("a reload warns first and then restores the draft", async ({ page }) => {
  await openTemplate(page);
  await titleField(page).fill("Kept {service}");
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();

  let warned = false;
  page.on("dialog", (dialog) => {
    warned = dialog.type() === "beforeunload";
    void dialog.accept();
  });
  await page.reload();

  expect(warned).toBe(true);
  await expect(page.getByText(/Unsaved draft restored/)).toBeVisible();
  await expect(titleField(page)).toHaveValue("Kept {service}");
});

test("the download button explains itself on hover", async ({ page }) => {
  await openTemplate(page);
  await downloadButton(page).hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Save the draft as surveys.json for uploading to the container.",
  );
});

test("the Problems tab title counts the problems", async ({ page }) => {
  await openTemplate(page);
  await expect(page.getByRole("tab", { name: "Problems" })).toHaveText(
    "Problems",
  );
  await titleField(page).fill("");
  await expect(page.getByRole("tab", { name: /^Problems/ })).toHaveText(
    "Problems (1)",
  );
});

test("the Load menu offers the same four routes", async ({ page }) => {
  await openTemplate(page);
  await page.getByRole("button", { name: "Load", exact: true }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveCount(4);
  for (const name of [
    "The live file",
    "A file from this computer",
    "Pasted JSON",
    "The template",
  ]) {
    await expect(
      menu.getByRole("menuitem", { name, exact: true }),
    ).toBeVisible();
  }
  await menu.getByRole("menuitem", { name: "Pasted JSON" }).click();
  await expect(page.getByRole("dialog", { name: "Paste JSON" })).toBeVisible();
});
