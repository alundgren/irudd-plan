import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  for (const publicView of [false, true]) {
    test(`compact ${publicView ? "public" : "owner"} header at ${width}px`, async ({
      page,
      context,
    }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      if (publicView) await context.setExtraHTTPHeaders({});
      const root = publicView
        ? "/public/plans/owner-a/browser-plan"
        : "/plans/browser-plan";
      const documentPath = publicView
        ? `${root}/document`
        : "/api/plans/browser-plan";
      const title =
        "Review the complete plan and all its requirements while preserving existing notes. ".repeat(
          5,
        );
      await page.route(`**${documentPath}`, async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.plan.epicGoal = title;
        await route.fulfill({ response, json: body });
      });
      await page.goto(root);
      const header = page.locator(".review-header");
      await expect(header.locator("h1")).toHaveText(title);
      await expect(
        page.locator('.overview-sheet [data-section="epic-goal"]'),
      ).toContainText(title);
      await expect(header.getByText(/^Live · r/)).toBeVisible();
      const bounds = await header.boundingBox();
      expect(bounds).toMatchObject({
        x: 0,
        y: 0,
        width,
        height: width === 1440 ? 68 : 95,
      });
      const titleBounds = await header.locator("h1").boundingBox();
      expect(titleBounds!.height).toBeLessThan(30);
      for (const control of [
        header.getByRole("button", { name: publicView ? "Overview" : "Plans" }),
        header.locator(".plan-details-toggle"),
        header.getByRole("button", { name: "Feedback 0", exact: true }),
      ]) {
        const box = await control.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(bounds!.height);
      }
      await expect(page.locator(".react-flow")).toHaveCSS(
        "background-color",
        "rgb(234, 223, 205)",
      );
      const grid = await page.locator(".react-flow").evaluate((canvas) => {
        const zoom = new DOMMatrix(
          getComputedStyle(canvas.querySelector(".react-flow__viewport")!)
            .transform,
        ).a;
        return (
          Number(canvas.querySelector("pattern")!.getAttribute("width")) / zoom
        );
      });
      expect(grid).toBeCloseTo(20);
      await expect(header).toHaveCSS("background-color", "rgb(242, 234, 222)");
      await expect(header.locator("h1")).toHaveCSS(
        "font-family",
        "system-ui, sans-serif",
      );
      await expect(page.locator(".plan-sheet.selected")).toHaveCSS(
        "background-color",
        "rgb(249, 246, 240)",
      );
      await expect(page.locator(".plan-sheet.selected")).toHaveCSS(
        "box-shadow",
        "rgba(96, 73, 57, 0.07) 0px 4px 16px 0px",
      );
      await page.screenshot({ path: testInfo.outputPath("overview.png") });
      await header
        .getByRole("button", { name: "Feedback 0", exact: true })
        .click();
      await expect(page.locator(".feedback-panel")).toBeVisible();
      const panel = await page.locator(".feedback-panel").boundingBox();
      expect(panel!.y).toBeGreaterThanOrEqual(bounds!.height);
      await page.screenshot({ path: testInfo.outputPath("feedback.png") });
      await page
        .locator(".feedback-panel")
        .getByRole("button", { name: /close/i })
        .click();
      await header.locator(".plan-details-toggle").focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".plan-details-content")).toBeVisible();
      if (publicView) {
        await expect(page.locator(".retention-notice")).toHaveCount(0);
        await expect(header).not.toContainText("Last checked");
      }
      await page.keyboard.press("Enter");
      await context.setOffline(true);
      await expect(header.locator(".connection")).toContainText("reconnecting");
      await expect(header.locator(".connection")).toBeVisible();
      await expect(header.locator(".connection")).toHaveCSS(
        "color",
        "rgb(143, 58, 45)",
      );
      await page.screenshot({
        path: testInfo.outputPath("connection-failure.png"),
      });
      await context.setOffline(false);
    });
  }
}
