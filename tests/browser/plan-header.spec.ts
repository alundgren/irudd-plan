import { expect, test } from "@playwright/test";

for (const width of [1440, 390, 320]) {
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
      await expect(header.locator("h1")).toHaveCount(0);
      await expect(
        header.getByRole("button", { name: "Read work item" }),
      ).toBeVisible();
      await expect(
        page.locator('.overview-sheet [data-section="epic-goal"]'),
      ).toContainText(title);
      await expect(header.locator(".review-header-status")).toHaveCount(0);
      const bounds = await header.boundingBox();
      expect(bounds).toMatchObject({
        x: 0,
        y: 0,
        width,
      });
      for (const control of [
        header.getByRole("button", { name: "Plans" }),
        header.getByRole("button", { name: "Read work item" }),
        header.getByRole("button", { name: "Feedback 0", exact: true }),
      ]) {
        const box = await control.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(bounds!.height);
      }
      await expect(page.locator(".plan-viewport")).toHaveCSS(
        "background-color",
        "rgb(234, 223, 205)",
      );
      await expect(page.locator(".plan-viewport")).toHaveCSS(
        "background-size",
        "20px 20px",
      );
      await expect(page.locator(".plan-viewport")).toHaveCSS(
        "background-image",
        /radial-gradient/,
      );
      await expect(header).toHaveCSS("background-color", "rgb(242, 234, 222)");
      await expect(header.locator(".header-navigation")).toHaveCSS(
        "font-family",
        "system-ui, sans-serif",
      );
      await expect(page.locator(".plan-sheet.selected")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await expect(page.locator(".plan-sheet.selected")).toHaveCSS(
        "box-shadow",
        "none",
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
      await expect(header.getByRole("button")).toHaveCount(4);
      await header.getByRole("button", { name: "Read work item" }).click();
      const menu = await page.locator(".work-item-menu").boundingBox();
      expect(menu!.x).toBeGreaterThanOrEqual(0);
      expect(menu!.x + menu!.width).toBeLessThanOrEqual(width);
      expect(menu!.width).toBeGreaterThanOrEqual(Math.min(300, width - 16));
      await page
        .getByRole("combobox", { name: "Find work item" })
        .fill("Work item 2");
      await expect(
        page.getByRole("option", { name: "Work item 2", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await context.setOffline(true);
      await expect(page.locator(".review-app")).toHaveAttribute(
        "data-connection",
        "reconnecting",
      );
      await expect(header.getByRole("button")).toHaveCount(4);
      await expect(header).toHaveText(/Plans.*Epic goal.*Feedback 0/);
      expect(await header.boundingBox()).toEqual(bounds);
      await context.setOffline(false);
    });
  }
}

test("long item headers keep their layout through zoom and chooser navigation", async ({
  page,
}) => {
  await page.route("**/api/plans/browser-plan", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.plan.items[0].title =
      "A long work item title that wraps across the header without clipping. ".repeat(
        8,
      );
    await route.fulfill({ response, json: body });
  });
  await page.goto("/plans/browser-plan/items/item-1");
  const heading = page.locator('[data-frame-item="item-1"] .frame-heading');
  const dimensions = () =>
    heading.evaluate((element) => ({
      height: (element as HTMLElement).offsetHeight,
      width: (element as HTMLElement).offsetWidth,
      textHeight: element.querySelector("button")!.scrollHeight,
    }));
  const original = await dimensions();
  expect(original.height).toBeLessThan(300);
  const viewport = page.locator(".plan-viewport");
  for (const key of ["-", "-", "-", "+", "+", "+"]) {
    await viewport.focus();
    await page.keyboard.press(key);
    const current = await dimensions();
    expect(current.width).toBe(original.width);
    expect(current.textHeight).toBeLessThanOrEqual(current.height);
  }
  await expect(
    page.getByRole("button", { name: "Jump to reference" }),
  ).toHaveCount(0);
  const chooser = page
    .locator(".review-header")
    .getByRole("button", { name: "Read work item" });
  await chooser.click();
  await page
    .getByRole("combobox", { name: "Find work item" })
    .fill("Work item 2");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/items\/item-2$/);
  await expect(page.locator(".item-sheet.selected")).toBeInViewport();
  await chooser.click();
  await page.getByRole("option", { name: "Epic goal", exact: true }).click();
  await expect(page).toHaveURL(/browser-plan$/);
  await expect(page.locator(".overview-sheet.selected")).toBeInViewport();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("item header centers both columns inside the available viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/plans/browser-plan");
  const frame = page.locator('[data-frame-item="item-1"]');
  await frame.locator(".item-title-bar").click();
  const expectCentered = async () => {
    await expect
      .poll(async () => {
        const item = (await frame.boundingBox())!;
        const view = (await page.locator(".plan-viewport").boundingBox())!;
        return Math.abs(item.x + item.width / 2 - view.x - view.width / 2);
      })
      .toBeLessThan(1);
    const item = (await frame.boundingBox())!;
    const view = (await page.locator(".plan-viewport").boundingBox())!;
    expect(item.x).toBeGreaterThanOrEqual(view.x + 23);
    expect(item.x + item.width).toBeLessThanOrEqual(view.x + view.width - 23);
    expect(item.y).toBeCloseTo(view.y + 24, 0);
  };
  await expectCentered();
  await frame.locator(".item-title-bar").click();
  await expectCentered();
  await page.getByRole("button", { name: "Feedback 0", exact: true }).click();
  await expectCentered();
  await page.setViewportSize({ width: 1200, height: 900 });
  await expectCentered();
});
