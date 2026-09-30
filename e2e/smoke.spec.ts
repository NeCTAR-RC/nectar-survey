import { expect, test } from "@playwright/test";

test("demo page loads the built bundle", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Nectar survey popup demo");
  await expect(
    page.locator('script[type="module"][src="./nectar-survey.js"]'),
  ).toHaveCount(1);
  const registered = await page.evaluate(
    () => customElements.get("nectar-survey") !== undefined,
  );
  expect(registered).toBe(true);
});

/*
 * Guards the split between the entry, which every host page runs, and the
 * dialog chunk, loaded only when a survey is due. A Playwright test rather
 * than a unit test: it needs the built file, which the e2e suite always has
 * and the unit test run does not.
 */
test("the entry script stays small and free of React and CSS", async ({
  request,
}) => {
  const response = await request.get("/nectar-survey.js");
  expect(response.ok()).toBe(true);
  const script = await response.body();
  expect(script.byteLength).toBeLessThan(20 * 1024);

  const text = script.toString("utf8");
  expect(text).toMatch(/import\(.\.\/assets\/dialog-[\w-]+\.js.\)/);
  expect(text).not.toContain("react");
  expect(text).not.toContain("createRoot");
  expect(text).not.toContain("__nectarSurveyCss");
  // Vite's preload helper, which vite.config.ts removes from the entry.
  expect(text).not.toContain("preloadError");
});
