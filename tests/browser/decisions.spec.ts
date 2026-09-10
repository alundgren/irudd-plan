import { expect, test } from "@playwright/test";
import { panTo } from "./canvas.js";

for (const width of [1440, 390]) {
  test(`required decisions remain readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/plans/browser-plan/items/item-1");
    const decisions = page.locator('[data-section="item-1:decisions"]');
    await panTo(page, decisions);
    await expect(
      decisions.getByRole("heading", { name: "Decisions to follow" }),
    ).toBeVisible();
    await expect(decisions).toContainText(
      "These choices are part of the current plan. Follow them during implementation.",
    );
    await expect(decisions).toContainText(
      "Use SQLite with generated migrations.",
    );
    await expect(decisions).toContainText(
      "Why: The deployment target is one self-hosted node.",
    );
    expect(
      await decisions.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    const bounds = await decisions.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `test-results/decisions-${width}.png`,
    });
  });
}

test("public readers get the same decision instruction; empty items omit it", async ({
  page,
}) => {
  await page.goto("/public/plans/owner-a/browser-plan/items/item-1");
  const decisions = page.locator('[data-section="item-1:decisions"]');
  await panTo(page, decisions);
  await expect(decisions).toContainText("Follow them during implementation.");
  await page.goto("/plans/browser-plan/items/item-2");
  await expect(
    page.locator('.item-sheet.selected[data-item-id="item-2"]'),
  ).toBeVisible();
  await expect(page.locator('[data-section="item-2:decisions"]')).toHaveCount(
    0,
  );
});
