import { expect, test } from "@playwright/test";

for (const state of ["retained", "scheduled", "unknown"] as const) {
  test(`owner can read ${state} retention status at desktop and narrow widths`, async ({
    page,
  }) => {
    await page.route("**/api/plans/browser-plan", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.retention = {
        status: state,
        reason:
          state === "unknown"
            ? "GitHub installation access was denied. Content is retained until GitHub can be checked."
            : state === "retained"
              ? "Linked GitHub work is open."
              : "All linked GitHub work is inactive.",
        createdAt: "2026-01-01T00:00:00Z",
        checkedAt: "2026-02-01T00:00:00Z",
        nextCheckAt: "2026-02-02T00:00:00Z",
        inactiveSince: state === "scheduled" ? "2026-02-01T00:00:00Z" : null,
        expiresAt: state === "scheduled" ? "2026-03-03T00:00:00Z" : null,
      };
      await route.fulfill({ response, json: body });
    });
    await page.goto("/plans/browser-plan");
    const notice = page.locator(".retention-notice");
    await expect(notice).toContainText(
      state === "retained"
        ? "Retained for open GitHub work"
        : state === "unknown"
          ? "GitHub status unknown"
          : "Scheduled expiry",
    );
    await expect(notice).toContainText("Last checked");
    if (state === "scheduled")
      await expect(notice).toContainText("Once deleted, content is lost.");
    if (state === "unknown")
      await expect(notice).toContainText("installation access was denied");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const bounds = await notice.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await expect(notice).toBeVisible();
      const canvas = await page.locator(".react-flow").boundingBox();
      expect(canvas!.y).toBeGreaterThanOrEqual(bounds!.y + bounds!.height);
    }
  });
}

test("an expired live plan replaces cached content with the unavailable state", async ({
  page,
}) => {
  await page.goto("/plans/browser-plan");
  await expect(page.locator(".review-app")).toBeVisible();
  await page.route("**/api/plans/browser-plan", (route) =>
    route.fulfill({ status: 404, json: { error: "Plan is unavailable" } }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByRole("heading", { name: "Plan unavailable" }),
  ).toBeVisible();
  await expect(page.locator(".review-app")).toHaveCount(0);
  expect(page.url()).toContain("/plans/browser-plan");
});

test("stale selection and opened feedback remain below the narrow retention header", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/plans/browser-plan/items/missing-item");
  const header = page.locator(".review-header");
  const notice = page.locator(".deleted-notice");
  await expect(notice).toContainText("This work item was deleted");
  const headerBounds = await header.boundingBox();
  const noticeBounds = await notice.boundingBox();
  expect(noticeBounds!.y).toBeGreaterThanOrEqual(
    headerBounds!.y + headerBounds!.height,
  );
  await notice.getByRole("button", { name: "Open overview" }).click();
  await expect(page).toHaveURL(/\/plans\/browser-plan$/);
  await expect(notice).toHaveCount(0);
  await page.getByRole("button", { name: /^Feedback/ }).click();
  const panel = page.locator(".feedback-panel");
  await expect(panel).toBeVisible();
  const panelBounds = await panel.boundingBox();
  expect(panelBounds!.y).toBeGreaterThanOrEqual(
    headerBounds!.y + headerBounds!.height,
  );
  expect(panelBounds!.y + panelBounds!.height).toBeLessThanOrEqual(844);
  await panel.getByRole("button", { name: /close/i }).click();
  await expect(panel).toHaveCount(0);
});
