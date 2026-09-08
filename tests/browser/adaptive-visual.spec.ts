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
