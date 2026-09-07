import { expect, test, type Page } from "@playwright/test";
import type { PlanDocument } from "../../src/web/client-api.js";

async function zoomToMode(page: Page, mode: string, direction: "in" | "out") {
  for (let index = 0; index < 12; index++) {
    if (
      (await page.locator(".plan-viewport").getAttribute("data-mode")) === mode
    )
      return;
    await page
      .getByRole("button", { name: `Zoom ${direction}`, exact: true })
      .click();
  }
  await expect(page.locator(".plan-viewport")).toHaveAttribute(
    "data-mode",
    mode,
  );
}
async function assertFrames(page: Page) {
  const frames = await page.locator(".item-frame").evaluateAll((elements) =>
    elements.map((element) => ({
      frame: element.getBoundingClientRect().toJSON(),
      bar: element
        .querySelector(".item-title-bar")!
        .getBoundingClientRect()
        .toJSON(),
    })),
  );
  expect(
    frames.every(
      ({ frame, bar }) =>
        Math.abs(bar.left - frame.left - 1) < 1 &&
        Math.abs(bar.right - frame.right + 1) < 1 &&
        Math.abs(bar.top - frame.top - 1) < 1,
    ),
  ).toBe(true);
  const overlaps: number[][] = [];
  for (let i = 0; i < frames.length; i++)
    for (let j = i + 1; j < frames.length; j++) {
      const a = frames[i]!.frame,
        b = frames[j]!.frame;
      if (
        !(
          a.right <= b.left ||
          b.right <= a.left ||
          a.bottom <= b.top ||
          b.bottom <= a.top
        )
      )
        overlaps.push([i, j]);
    }
  expect(overlaps).toEqual([]);
}
for (const width of [1440, 390]) {
  test(`adaptive sections preserve long content at ${width}px`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/api/plans/browser-plan", async (route) => {
      const response = await route.fetch();
      const doc = (await response.json()) as PlanDocument;
      const item = doc.plan.items[0]!;
      await route.fulfill({
        json: {
          ...doc,
          plan: {
            ...doc.plan,
            items: Array.from({ length: 50 }, (_, i) => ({
              ...item,
              requiredContextIds: i < 2 ? item.requiredContextIds : [],
              requiredDecisionIds: i < 2 ? item.requiredDecisionIds : [],
              requiredAssetIds: i < 2 ? item.requiredAssetIds : [],
              id: `long-${i}`,
              title: `${i + 1} ${"A long title that wraps without covering another item. ".repeat(3)}`,
              goal: `${item.goal}\n\n${"Complete prose remains readable. ".repeat(20)}`,
            })),
          },
        },
      });
    });
    await page.goto("/plans/browser-plan");
    await expect(page.locator(".item-frame")).toHaveCount(50);
    await assertFrames(page);
    await page.locator(".item-frame").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`overview-${width}.png`) });
    await zoomToMode(page, "sections", "in");
    await assertFrames(page);
    await page.locator(".item-frame").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`sections-${width}.png`) });
    await page.locator(".item-title-bar").first().click();
    await expect(page).toHaveURL(/items\/long-0$/);
    await expect(page.locator(".plan-viewport")).toHaveAttribute(
      "data-mode",
      "reading",
    );
    await expect(page.locator(".item-frame")).toHaveCount(1);
    for (let i = 0; i < 4; i++)
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    const view = await page.locator(".plan-viewport").boundingBox();
    const frame = await page.locator(".item-frame").boundingBox();
    expect(
      Math.abs(frame!.x + frame!.width / 2 - view!.x - (view!.width - 15) / 2),
    ).toBeLessThan(10);
    expect(
      await page
        .locator(".item-sheet")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`reading-${width}.png`) });
    await page.locator(".plan-viewport").evaluate((el) => (el.scrollTop = 500));
    const before = await page
      .locator(".plan-viewport")
      .evaluate((el) => el.scrollTop);
    await page.getByRole("button", { name: "Feedback 0", exact: true }).click();
    expect(
      await page.locator(".plan-viewport").evaluate((el) => el.scrollTop),
    ).toBe(before);
    await page
      .getByRole("button", { name: "Close feedback", exact: true })
      .click();
    await zoomToMode(page, "sections", "out");
    await zoomToMode(page, "reading", "in");
    expect(
      await page.locator(".plan-viewport").evaluate((el) => el.scrollTop),
    ).toBe(before);
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await expect(page.locator(".item-frame")).toHaveCount(50);
    await expect(page.locator(".plan-viewport")).toHaveAttribute(
      "data-mode",
      "overview",
    );
  });
}

test("summary and title navigation never create a comment", async ({
  page,
}) => {
  await page.goto("/plans/browser-plan");
  await page
    .getByRole("button", { name: "Read Work item 1", exact: true })
    .click();
  await expect(page.locator(".item-sheet.selected")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Jump to reference", exact: true })
    .click();
  await expect(page.locator(".reference-sheet.selected")).toBeInViewport();
  await page
    .locator(".reference-sheet.selected")
    .getByRole("button", { name: "Return to Work item 1", exact: true })
    .click();
  await expect(page.locator(".item-title-bar")).toBeInViewport();
  await page
    .locator(".canvas-navigation")
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await page.goBack();
  await expect(page.locator(".plan-viewport")).toHaveAttribute(
    "data-mode",
    "reading",
  );
  await page.goForward();
  await expect(page.locator(".plan-viewport")).toHaveAttribute(
    "data-mode",
    "overview",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("reveals legacy notes from summaries and retains negative canvas coordinates", async ({
  page,
}) => {
  const response = await page.request.get("/api/plans/browser-plan");
  const document = (await response.json()) as PlanDocument;
  const key = `irudd-plan:feedback:v1:${document.feedbackScope}:${document.plan.planId}`;
  const notes = [
    {
      id: "legacy-section",
      target: {
        kind: "section",
        itemId: "item-1",
        sectionId: "requirements",
        label: "Requirements",
        originalText: document.plan.items[0]!.requirements.join("\n"),
        originalExcerpt: document.plan.items[0]!.requirements[0],
        excerptOccurrence: 1,
      },
    },
    { id: "legacy-canvas", target: { kind: "canvas", x: -900, y: -500 } },
  ].map((note) => ({
    ...note,
    planId: document.plan.planId,
    observedVersion: document.version,
    createdAt: "2026-09-07T00:00:00Z",
    requestedChange: "Keep this original location",
  }));
  await page.goto("/plans/browser-plan");
  await page.evaluate(
    ({ key, notes }) =>
      localStorage.setItem(key, JSON.stringify({ items: notes })),
    { key, notes },
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open section feedback 1" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open canvas feedback 2" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Feedback 2", exact: true }).click();
  await page.locator(".feedback-location").first().click();
  await expect(page.locator(".plan-viewport")).toHaveAttribute(
    "data-mode",
    "reading",
  );
  await expect(
    page.locator('[data-section="item-1:requirements"]'),
  ).toBeInViewport();
  await page.locator(".feedback-location").nth(1).click();
  await expect(page.locator(".plan-viewport")).toHaveAttribute(
    "data-mode",
    "sections",
  );
  await expect(
    page.getByRole("button", { name: "Open canvas feedback 2" }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).items,
      key,
    ),
  ).toEqual(notes);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open canvas feedback 2" }),
  ).toHaveCount(0);
});

test("zooms into the nearest visible item and keeps explicit section selection", async ({
  page,
}) => {
  await page.goto("/plans/browser-plan");
  await zoomToMode(page, "sections", "in");
  await page.locator('[data-frame-item="item-7"]').scrollIntoViewIfNeeded();
  const nearest = await page.locator(".plan-viewport").evaluate((view) => {
    const center = view.getBoundingClientRect().top + view.clientHeight / 2;
    return Array.from(view.querySelectorAll<HTMLElement>(".item-frame"))
      .map((element) => ({
        id: element.dataset.frameItem,
        distance: Math.abs(
          (element.getBoundingClientRect().top +
            element.getBoundingClientRect().bottom) /
            2 -
            center,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0]!.id;
  });
  await page.getByTitle("Reset to 100%", { exact: true }).click();
  await expect(page.locator(".item-frame")).toHaveAttribute(
    "data-frame-item",
    nearest!,
  );
  await zoomToMode(page, "sections", "out");
  const next = page.locator('[data-frame-item="item-2"]');
  await next.scrollIntoViewIfNeeded();
  await next.dispatchEvent("wheel", { ctrlKey: true, deltaY: -100 });
  await expect(page.locator(".item-frame")).toHaveCount(1);
  await expect(page.locator(".item-frame")).toHaveAttribute(
    "data-frame-item",
    "item-2",
  );
  await expect(page).toHaveURL(/items\/item-2$/);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.getByTitle("Reset to 100%", { exact: true }).click();
  await expect(page.locator(".item-frame")).toHaveAttribute(
    "data-frame-item",
    "item-2",
  );
});

test("item index opens and closes without starting feedback", async ({
  page,
}) => {
  await page.goto("/plans/browser-plan");
  const disclosure = page.locator("summary", { hasText: "Work item index" });
  for (const open of [true, false]) {
    await disclosure.click();
    await expect(disclosure.locator("..")).toHaveJSProperty("open", open);
    // Comment capture waits 300 ms to distinguish clicks from selection.
    await page.waitForTimeout(400);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("keyboard heading feedback retains the original item target", async ({
  page,
}) => {
  await page.goto("/plans/browser-plan/items/item-1");
  const action = page.locator(".frame-heading").getByRole("button", {
    name: "Add feedback to Work item heading",
    exact: true,
  });
  await action.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("textbox", { name: "About", exact: true }),
  ).toHaveValue("Work item 1 · Work item heading");
  await page
    .getByRole("textbox", { name: "Your feedback", exact: true })
    .fill("Clarify this heading");
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  const target = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) =>
      entry.endsWith(":browser-plan"),
    )!;
    return JSON.parse(localStorage.getItem(key)!).items[0].target;
  });
  expect(target).toMatchObject({
    kind: "section",
    itemId: "item-1",
    sectionId: "header",
    originalText: "Work item 1",
    originalExcerpt: "Work item 1",
  });
});
