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
    const summary = page.locator(".plan-details-toggle");
    const notice = page.locator(".retention-notice");
    await expect(notice).not.toBeVisible();
    if (state !== "retained") {
      await expect(page.locator(".review-header-status")).toContainText(
        state === "scheduled" ? "Scheduled expiry" : "Retention unknown",
      );
    }
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(summary).toHaveAttribute("aria-expanded", "true");
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
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      const bounds = await notice.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await expect(notice).toBeVisible();
      const canvas = await page.locator(".plan-viewport").boundingBox();
      expect(canvas!.y).toBeGreaterThanOrEqual(bounds!.y + bounds!.height);
      await summary.focus();
      await page.keyboard.press("Space");
      await expect(notice).not.toBeVisible();
      const header = await page.locator(".review-header").boundingBox();
      expect(header!.height).toBe(width === 1440 ? 68 : 95);
      await page.keyboard.press("Enter");
      await expect(notice).toBeVisible();
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

for (const publicView of [false, true]) {
  test(`unavailable ${publicView ? "public" : "owner"} plans stop stream and document retries`, async ({
    page,
  }) => {
    const root = publicView
      ? "/public/plans/owner-a/browser-plan"
      : "/plans/browser-plan";
    const documentPath = publicView
      ? `${root}/document`
      : "/api/plans/browser-plan";
    const eventsPath = publicView
      ? `${root}/events`
      : "/api/plans/browser-plan/events";
    await page.goto(root);
    await expect(page.locator(".review-app")).toBeVisible();
    let documents = 0;
    let streams = 0;
    await page.route(`**${documentPath}`, (route) => {
      documents += 1;
      return route.fulfill({
        status: 404,
        json: { error: "Plan is unavailable" },
      });
    });
    await page.route(`**${eventsPath}`, (route) => {
      streams += 1;
      return route.fulfill({
        contentType: "text/event-stream",
        body: "retry: 100\n\n",
      });
    });
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(
      page.getByRole("heading", { name: "Plan unavailable" }),
    ).toBeVisible();
    expect(documents).toBeGreaterThan(0);
    expect(streams).toBeGreaterThan(0);
    const stopped = { documents, streams };
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
    });
    // Observe several of the server's 100ms reconnect intervals.
    await page.waitForTimeout(700);
    expect({ documents, streams }).toEqual(stopped);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect.poll(() => documents).toBe(stopped.documents + 1);
    await page.waitForTimeout(300);
    expect(streams).toBe(stopped.streams);
    expect(documents).toBe(stopped.documents + 1);
    await page.unroute(`**${documentPath}`);
    await page.unroute(`**${eventsPath}`);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator(".review-app")).toBeVisible();
    await expect(page.getByText(/^Live · r/)).toBeVisible();
  });
}
