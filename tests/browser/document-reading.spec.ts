import { chooseItem } from "./canvas.js";
import { expect, test, type Page } from "@playwright/test";
import type { Plan } from "../../src/contract/plan.js";
import { panTo } from "./canvas.js";

async function expectReadingTop(page: Page) {
  await expect(page.locator(".plan-sheet.selected").first()).toBeInViewport();
  const selected = (await page.locator(".plan-sheet.selected").boundingBox())!;
  const view = (await page.locator(".plan-viewport").boundingBox())!;
  expect(selected.width).toBeLessThanOrEqual(view.width);
}

for (const width of [1280, 390]) {
  test(`reads a continuous long document at ${width}px and restores its top through history`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await useLongDocument(page);
    await page.goto("/plans/browser-plan/items/item-1");
    await expectReadingTop(page);
    const selected = page.locator(".plan-sheet.selected");
    expect((await selected.boundingBox())?.height).toBeGreaterThan(2500);
    const scrollContainers = await selected.evaluate(
      (sheet) =>
        [sheet, ...sheet.querySelectorAll("*")].filter((element) => {
          const style = getComputedStyle(element);
          return (
            ["auto", "scroll"].includes(style.overflowY) &&
            element.scrollHeight > element.clientHeight
          );
        }).length,
    );
    expect(scrollContainers).toBe(0);
    await expect(selected.locator("details, .related-items")).toHaveCount(0);
    await expect(page.locator(".item-frame")).toHaveCount(10);

    const goal = selected
      .locator('[data-section="item-1:goal"] .rich-text p')
      .first();
    await panTo(page, goal);
    const viewport = page.locator(".plan-viewport");
    const beforeSelection = await viewport.evaluate((el) =>
      String(
        new DOMMatrix(
          getComputedStyle(el.querySelector(".plan-layout")!).transform,
        ).f,
      ),
    );
    const bounds = await goal.boundingBox();
    if (bounds === null) throw new Error("Missing goal");
    await page.mouse.move(bounds.x + 2, bounds.y + 10);
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + Math.min(220, bounds.width - 4),
      bounds.y + 10,
      { steps: 10 },
    );
    await page.mouse.up();
    expect(
      await page.evaluate(() => window.getSelection()?.toString().length),
    ).toBeGreaterThan(5);
    expect(
      await viewport.evaluate((el) =>
        String(
          new DOMMatrix(
            getComputedStyle(el.querySelector(".plan-layout")!).transform,
          ).f,
        ),
      ),
    ).toBe(beforeSelection);
    await expect(page.locator(".feedback-panel")).toHaveCount(0);

    const completion = selected.getByText(
      "Completion marker at the end of the long document.",
    );
    await panTo(page, completion);
    await expect(completion).toBeInViewport();
    const beforeControl = await viewport.evaluate((el) =>
      String(
        new DOMMatrix(
          getComputedStyle(el.querySelector(".plan-layout")!).transform,
        ).f,
      ),
    );
    await page.getByRole("button", { name: "Feedback 0", exact: true }).click();
    await expect(page.locator(".feedback-panel")).toBeVisible();
    await expect(completion).toBeInViewport();
    const afterControl = await viewport.evaluate((el) =>
      String(
        new DOMMatrix(
          getComputedStyle(el.querySelector(".plan-layout")!).transform,
        ).f,
      ),
    );
    expect(Number(afterControl)).toBeCloseTo(Number(beforeControl), 1);
    await page.getByRole("button", { name: "Close feedback" }).click();
    await chooseItem(page, "Epic goal");
    await expectReadingTop(page);
    await expect(page.locator(".overview-sheet h2")).toHaveText(
      "Review a complete delivery plan without losing the current conversation or reading position.",
    );
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await page.goBack();
    await expect(page.locator(".item-sheet.selected")).toBeInViewport();
    await expect(selected).toHaveAttribute("aria-label", "Work item 1");
    await page.goForward();
    await expectReadingTop(page);
    await expect(selected).toHaveAttribute("aria-label", "Epic overview");
  });
}

async function useLongDocument(page: Page) {
  await page.route("**/api/plans/browser-plan", async (route) => {
    const response = await route.fetch();
    const document = (await response.json()) as { plan: Plan };
    await route.fulfill({
      json: {
        ...document,
        plan: {
          ...document.plan,
          items: document.plan.items.map((item, index) =>
            index === 0
              ? {
                  ...item,
                  requirements: Array.from(
                    { length: 30 },
                    (_, i) =>
                      `Requirement ${i + 1}: Keep every part of this deliberately long document readable, including its existing prior art and completion information.`,
                  ),
                  completionExpectation:
                    "Completion marker at the end of the long document.",
                }
              : item,
          ),
        },
      },
    });
  });
}

test.describe("phone touch navigation", () => {
  test.use({ hasTouch: true });
  test("touch swipes move a phone document without adding feedback", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const session = await context.newCDPSession(page);
    await page.goto("/plans/browser-plan/items/item-1");
    await expectReadingTop(page);
    const sheet = page.locator(".plan-sheet.selected");
    const before = await sheet.boundingBox();
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 180, y: 650 }],
    });
    for (const y of [600, 550, 500, 450, 400]) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 180, y }],
      });
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(async () => (await sheet.boundingBox())?.y)
      .toBeCloseTo(before!.y - 250, 0);
    await expect(page.locator(".feedback-panel")).toHaveCount(0);
    const beforeTap = await page
      .locator(".plan-viewport")
      .evaluate((el) =>
        String(
          new DOMMatrix(
            getComputedStyle(el.querySelector(".plan-layout")!).transform,
          ).f,
        ),
      );
    await page.getByRole("button", { name: "Feedback 0", exact: true }).tap();
    await expect(page.locator(".feedback-panel")).toBeVisible();
    expect(
      await page
        .locator(".plan-viewport")
        .evaluate((el) =>
          String(
            new DOMMatrix(
              getComputedStyle(el.querySelector(".plan-layout")!).transform,
            ).f,
          ),
        ),
    ).toBe(beforeTap);
  });
});

test("keeps the selected reading position when other items move and the viewport narrows", async ({
  page,
}) => {
  let reordered = false;
  await page.route("**/api/plans/browser-plan", async (route) => {
    const response = await route.fetch();
    const document = (await response.json()) as { plan: Plan; version: number };
    await route.fulfill({
      json: reordered
        ? {
            ...document,
            version: document.version + 1,
            plan: {
              ...document.plan,
              items: [...document.plan.items].reverse(),
            },
          }
        : document,
    });
  });
  await page.goto("/plans/browser-plan/items/item-1");
  await expectReadingTop(page);
  const selected = page.locator(".plan-sheet.selected");
  await panTo(
    page,
    selected.getByRole("heading", { name: "Requirements", exact: true }),
  );
  const before = await selected.boundingBox();
  reordered = true;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  await expect(page.locator(".review-app")).toHaveAttribute(
    "data-version",
    "2",
  );
  await expect
    .poll(async () => (await selected.boundingBox())?.x)
    .toBeCloseTo(before!.x, 1);
  expect((await selected.boundingBox())?.y).toBeCloseTo(before!.y, 1);
  const relativeTop = async () =>
    (await selected.boundingBox())!.y -
    (await page.locator(".plan-viewport").boundingBox())!.y;
  const topBefore = await relativeTop();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const b = (await selected.boundingBox())!;
      return b.x + b.width / 2;
    })
    .toBeCloseTo(195, 0);
  expect(await relativeTop()).toBeCloseTo(topBefore, 1);
});

for (const selectionState of ["starting", "active"]) {
  test(`touch panning stops when text selection is ${selectionState}`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const session = await context.newCDPSession(page);
    await session.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    await page.goto("/plans/browser-plan/items/item-1");
    await expectReadingTop(page);
    const selected = page.locator(".plan-sheet.selected");
    const text = selected
      .locator('[data-section="item-1:goal"] .rich-text p')
      .first();
    const bounds = await text.boundingBox();
    if (bounds === null) throw new Error("Missing selectable text");
    const point = { x: bounds.x + 40, y: bounds.y + 20 };
    const viewport = page.locator(".plan-viewport");
    const before = await viewport.evaluate((el) =>
      String(
        new DOMMatrix(
          getComputedStyle(el.querySelector(".plan-layout")!).transform,
        ).f,
      ),
    );
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    await text.evaluate((element, state) => {
      if (state === "starting") {
        element.dispatchEvent(new Event("selectstart", { bubbles: true }));
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }, selectionState);
    for (const offset of [30, 60, 90]) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: point.x, y: point.y - offset }],
      });
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(100);
    expect(
      await viewport.evaluate((el) =>
        String(
          new DOMMatrix(
            getComputedStyle(el.querySelector(".plan-layout")!).transform,
          ).f,
        ),
      ),
    ).toBe(before);
    await expect(page.locator(".feedback-panel")).toHaveCount(0);
  });
}
