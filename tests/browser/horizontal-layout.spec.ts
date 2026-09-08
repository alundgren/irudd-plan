import { expect, test } from "@playwright/test";

const goal =
  "Remove tests that search human-facing prose without proving machine behavior or agent interpretation";

test("goal and compact summaries use the canvas across item counts and zoom levels", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  let count = 1;
  await page.route("**/api/plans/browser-plan", async (route) => {
    const response = await route.fetch();
    const document = await response.json();
    const base = document.plan.items[1];
    document.plan.epicGoal = goal;
    document.plan.assets = document.plan.assets.map((asset: { id: string }) =>
      asset.id === "asset-contract"
        ? {
            ...asset,
            caption:
              "Decision guide for retaining machine evidence, removing prose-only assertions, and deferring real agent interpretation evaluation.",
          }
        : asset,
    );
    document.plan.items = Array.from({ length: count }, (_, index) => ({
      ...base,
      id: `item-${index + 1}`,
      title: "Remove prose-only assertions from local workflow tests",
      requiredAssetIds: ["asset-contract"],
      shortGoal: "Test installer and vault behavior through state changes",
      dependsOnItemIds: [],
    }));
    await route.fulfill({ json: document });
  });
  const measurements = [];
  for (count = 1; count <= 15; count++) {
    await page.goto("/plans/browser-plan");
    await expect(page.locator(".item-frame")).toHaveCount(count);
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await expect
      .poll(async () =>
        page.locator(".plan-viewport").evaluate((view) => {
          const viewport = view.getBoundingClientRect();
          return Array.from(
            view.querySelectorAll(".item-frame, .overview-sheet"),
          ).every((element) => {
            const rect = element.getBoundingClientRect();
            return (
              rect.left >= viewport.left - 1 &&
              rect.right <= viewport.right + 1 &&
              rect.top >= viewport.top - 1 &&
              rect.bottom <= viewport.bottom + 1
            );
          });
        }),
      )
      .toBe(true);
    await expect
      .poll(async () =>
        page.locator(".plan-viewport").evaluate((view) => {
          const zoom = Number((view as HTMLElement).dataset.zoom);
          const heading = view.querySelector(".item-title-bar")!;
          return parseFloat(getComputedStyle(heading).fontSize) * zoom;
        }),
      )
      .toBeGreaterThanOrEqual(15.9);
    if ([1, 4, 8, 15].includes(count))
      await page.screenshot({ path: info.outputPath(`fit-${count}.png`) });
    for (const zoom of [
      ...Array.from({ length: 20 }, (_, i) => (20 - i) / 10),
      0.001,
    ]) {
      await page.locator(".plan-viewport").evaluate((view, target) => {
        const current = Number((view as HTMLElement).dataset.zoom);
        const delta = -Math.log(target / current) / 0.002;
        const steps = Math.ceil(Math.abs(delta) / 490);
        for (let i = 0; i < steps; i++)
          view.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              deltaY: delta / steps,
              clientX: 720,
              clientY: 300,
            }),
          );
      }, zoom);
      await expect
        .poll(async () =>
          Number(
            await page.locator(".plan-viewport").getAttribute("data-zoom"),
          ),
        )
        .toBeCloseTo(zoom, 4);
      const sizes = await page.locator(".plan-layout").evaluate((layout) => {
        const epic = layout.querySelector<HTMLElement>(".overview-sheet")!;
        const grid = layout.querySelector<HTMLElement>(".item-grid")!;
        const frames = Array.from(
          layout.querySelectorAll<HTMLElement>(".item-frame"),
        );
        return {
          summary: layout.classList.contains("show-summaries"),
          goalWidth: epic.offsetWidth,
          goalHeight: epic.offsetHeight,
          gridWidth: grid.offsetWidth,
          labelSize: parseFloat(
            getComputedStyle(epic.querySelector("h3")!).fontSize,
          ),
          heights: frames.map((frame) => frame.offsetHeight),
          overlap: frames.some((frame, i) =>
            frames
              .slice(i + 1)
              .some(
                (other) =>
                  frame.offsetLeft < other.offsetLeft + other.offsetWidth &&
                  frame.offsetLeft + frame.offsetWidth > other.offsetLeft &&
                  frame.offsetTop < other.offsetTop + other.offsetHeight &&
                  frame.offsetTop + frame.offsetHeight > other.offsetTop,
              ),
          ),
        };
      });
      expect(sizes.overlap).toBe(false);
      if (sizes.summary) expect(sizes.goalWidth).toBe(sizes.gridWidth);
      if (zoom >= 0.2)
        expect(sizes.labelSize * zoom).toBeGreaterThanOrEqual(13.5);
      measurements.push({ count, zoom, ...sizes });
    }
  }
  await info.attach("zoom-matrix", {
    body: JSON.stringify(measurements, null, 2),
    contentType: "application/json",
  });
});
