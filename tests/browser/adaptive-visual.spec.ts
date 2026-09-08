import { chooseItem } from "./canvas.js";
import { expect, test } from "@playwright/test";

test("captures the continuous canvas and checks attached non-overlapping headers", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/plans/browser-plan");
  await page.screenshot({ path: info.outputPath("fit.png") });
  await chooseItem(page);
  await page.screenshot({ path: info.outputPath("reading.png") });
  for (let i = 0; i < 8; i++) {
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    const frames = await page.locator(".item-frame").evaluateAll((elements) =>
      elements.map((element) => ({
        frame: element.getBoundingClientRect().toJSON(),
        header: element
          .querySelector(".item-title-bar")!
          .getBoundingClientRect()
          .toJSON(),
      })),
    );
    for (const { frame, header } of frames) {
      expect(header.left).toBeGreaterThanOrEqual(frame.left);
      expect(header.right).toBeLessThanOrEqual(frame.right + 1);
      expect(header.top).toBeGreaterThanOrEqual(frame.top);
      expect(header.bottom).toBeLessThanOrEqual(frame.bottom);
    }
    for (let a = 0; a < frames.length; a++)
      for (let b = a + 1; b < frames.length; b++) {
        const x = frames[a]!.frame,
          y = frames[b]!.frame;
        expect(
          x.right <= y.left ||
            y.right <= x.left ||
            x.bottom <= y.top ||
            y.bottom <= x.top,
        ).toBe(true);
      }
  }
  await page.screenshot({ path: info.outputPath("zoomed-out.png") });
});

test("overview keeps primary headings readable and every visual reachable", async ({
  page,
}, info) => {
  const { referenceFixture } = await import("./reference-fixture.js");
  const { panTo } = await import("./canvas.js");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await referenceFixture(page);
  await page.goto("/plans/browser-plan/items/item-1");
  for (let i = 0; i < 8; i++)
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  const zoom = Number(
    await page.locator(".plan-viewport").getAttribute("data-zoom"),
  );
  for (const selector of [".item-title-bar", ".overview-sheet h2"]) {
    const sizes = await page
      .locator(selector)
      .evaluateAll((elements) =>
        elements.map((element) =>
          parseFloat(getComputedStyle(element).fontSize),
        ),
      );
    for (const size of sizes) expect(size * zoom).toBeGreaterThanOrEqual(15.9);
  }
  const summary = page.locator('[data-frame-item="item-1"] .item-summary');
  await expect(summary.locator(".summary-reference")).toHaveCount(7);
  await expect(summary.locator("img")).toHaveCount(3);
  const frame = summary.locator("..");
  const summaryBounds = (await summary.boundingBox())!;
  const frameBounds = (await frame.boundingBox())!;
  expect(summaryBounds.y + summaryBounds.height).toBeLessThanOrEqual(
    frameBounds.y + frameBounds.height,
  );
  await panTo(page, summary);
  await page.screenshot({ path: info.outputPath("adaptive-references.png") });
  const reference = summary.getByRole("button", { name: "Wide overview" });
  await panTo(page, reference);
  await reference.click();
  await expect(page.locator(".reference-sheet.selected")).toHaveAttribute(
    "data-asset-id",
    "wide",
  );
  await expect(page.locator(".reference-sheet.selected")).toBeInViewport();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
