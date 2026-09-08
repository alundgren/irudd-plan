import { chooseItem, panTo } from "./canvas.js";
import { expect, test, type Page } from "@playwright/test";

const route = "/plans/browser-plan";
async function camera(page: Page) {
  return page.locator(".plan-layout").evaluate((element) => {
    const m = new DOMMatrix(getComputedStyle(element).transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
}
async function wheel(page: Page, deltaY: number, x = 260, y = 260) {
  await page.locator(".plan-viewport").evaluate(
    (element, point) => {
      const box = element.getBoundingClientRect();
      element.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaY: point.deltaY,
          clientX: box.left + point.x,
          clientY: box.top + point.y,
        }),
      );
    },
    { deltaY, x, y },
  );
}
async function read(page: Page, id = "item-1") {
  await page
    .getByRole("button", { name: "Read work item", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Find work item" })
    .fill(`Work item ${id.split("-")[1]}`);
  await page.getByRole("option").first().click();
}

async function save(page: Page, text: string) {
  await page
    .getByRole("textbox", { name: "Your feedback", exact: true })
    .fill(text);
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
}

test("small wheel gestures preserve the pointer and item order through both transition directions", async ({
  page,
}) => {
  await page.goto(route);
  await read(page);
  const ids = await page.locator(".item-frame").evaluateAll((elements) =>
    elements.map((e) => ({
      id: (e as HTMLElement).dataset.frameItem,
      x: (e as HTMLElement).offsetLeft,
    })),
  );
  const burst = await camera(page);
  await page.locator(".plan-viewport").evaluate((element) => {
    for (let i = 0; i < 10; i++)
      element.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaY: 1,
          clientX: 260,
          clientY: 260,
        }),
      );
  });
  expect((await camera(page)).zoom).toBeCloseTo(
    burst.zoom * Math.exp(-0.02),
    5,
  );
  const before = await camera(page);
  await wheel(page, 1);
  const small = await camera(page);
  expect(small.zoom).toBeLessThan(before.zoom);
  expect(before.zoom - small.zoom).toBeLessThan(0.01);
  for (const delta of [220, 220, 220, -220, -220, -220]) {
    const old = await camera(page);
    await wheel(page, delta);
    const next = await camera(page);
    expect(
      Math.abs(260 - next.x - ((260 - old.x) / old.zoom) * next.zoom),
    ).toBeLessThan(1);
    expect(
      Math.abs(260 - next.y - ((260 - old.y) / old.zoom) * next.zoom),
    ).toBeLessThan(1);
    expect(
      await page.locator(".item-frame").evaluateAll((elements) =>
        elements.map((e) => ({
          id: (e as HTMLElement).dataset.frameItem,
          x: (e as HTMLElement).offsetLeft,
        })),
      ),
    ).toEqual(ids);
    await expect(page).toHaveURL(/items\/item-1$/);
  }
});

for (const width of [1440, 390]) {
  test(`fits fifty measured items and reads complete text at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/plans/browser-plan", async (route) => {
      const response = await route.fetch();
      const document = await response.json();
      const base = document.plan.items[1];
      document.plan.items = Array.from({ length: 50 }, (_, i) => ({
        ...base,
        id: `item-${i + 1}`,
        title: `Work item ${i + 1}: A deliberately long title describing the complete delivery task`,
        requirements: Array.from(
          { length: i === 0 ? 30 : 3 },
          (_, n) =>
            `Requirement ${n + 1}: Preserve realistic long content and the full completion instructions.`,
        ),
      }));
      await route.fulfill({ json: document });
    });
    await page.goto(route);
    await expect(page.locator(".item-frame")).toHaveCount(50);
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    const geometry = await page.locator(".plan-viewport").evaluate((view) => {
      const v = view.getBoundingClientRect();
      return Array.from(view.querySelectorAll(".item-frame")).every(
        (element) => {
          const b = element.getBoundingClientRect();
          return (
            b.left >= v.left &&
            b.right <= v.right &&
            b.top >= v.top &&
            b.bottom <= v.bottom
          );
        },
      );
    });
    expect(geometry).toBe(true);
    await read(page);
    const sheet = page.locator(".item-sheet.selected");
    const bounds = (await sheet.boundingBox())!;
    expect(bounds.width).toBeLessThan(width);
    expect(bounds.height).toBeGreaterThan(2000);
    expect(bounds.x + bounds.width / 2).toBeCloseTo(width / 2, 0);
    const font = await sheet.evaluate((element) =>
      parseFloat(getComputedStyle(element).fontSize),
    );
    expect(font * (await camera(page)).zoom).toBeGreaterThanOrEqual(16);
    await page
      .getByRole("button", { name: "Read work item", exact: true })
      .click();
    await page.getByRole("option", { name: "Epic goal", exact: true }).click();
    const epic = page.locator(".overview-sheet.selected");
    const epicBounds = (await epic.boundingBox())!;
    expect(epicBounds.width).toBeLessThan(width);
    const epicFont = await epic.evaluate((element) =>
      parseFloat(getComputedStyle(element).fontSize),
    );
    expect(epicFont * (await camera(page)).zoom).toBeGreaterThanOrEqual(16);
    await read(page);

    await expect(page.locator(".item-frame")).toHaveCount(50);
    const text = sheet.locator(".rich-text p").first();
    await text.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      window.getSelection()?.addRange(range);
    });
    const selectedText = await page.evaluate(() =>
      window.getSelection()?.toString(),
    );
    await wheel(page, 1);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
      selectedText,
    );
  });
}

test("title navigation, references and browser history keep the continuous canvas", async ({
  page,
}) => {
  await page.goto(route);
  await page.locator('[data-frame-item="item-1"] .item-title-bar').click();
  await expect(page).toHaveURL(/items\/item-1$/);
  await expect(page.locator(".item-sheet.selected")).toBeInViewport();
  await panTo(
    page,
    page.locator(".item-sheet.selected .reference-link").first(),
  );
  await page.locator(".item-sheet.selected .reference-link").first().click();
  await expect(page.locator(".reference-sheet.selected")).toBeInViewport();
  await page.locator(".reference-sheet.selected .reference-link").click();
  await expect(page.locator(".item-sheet.selected")).toBeInViewport();
  await chooseItem(page, "Epic goal");
  await expect(page).toHaveURL(/browser-plan$/);
  await page.goBack();
  await expect(page.locator(".item-sheet.selected")).toBeInViewport();
  await expect(page.locator(".item-frame")).toHaveCount(10);
});

test("heading and positioned notes stay within their targets and canvas coordinates survive reload", async ({
  page,
}) => {
  await page.goto(route);
  await read(page);
  const goal = page.locator(
    '.item-sheet.selected [data-section="item-1:goal"]',
  );
  await goal
    .getByRole("button", { name: "Add feedback to Goal", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await save(page, "Heading note");
  const pin = page.getByRole("button", { name: "Open section feedback 1" });
  const check = async () => {
    const target = (await goal.boundingBox())!,
      b = (await pin.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(target.x - 1);
    expect(b.y).toBeGreaterThanOrEqual(target.y - 1);
    expect(b.x + b.width).toBeLessThanOrEqual(target.x + target.width + 1);
    expect(b.y + b.height).toBeLessThanOrEqual(target.y + target.height + 1);
  };
  await check();
  await page.getByRole("button", { name: "Close feedback" }).click();
  await goal.locator(".rich-text").click({ position: { x: 8, y: 8 } });
  await save(page, "Positioned note");
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await check();
  await page.getByRole("button", { name: "Comment on canvas center" }).focus();
  await page.keyboard.press("Enter");
  await save(page, "Canvas note");
  const stored = await page.evaluate(() =>
    localStorage.getItem(
      Object.keys(localStorage).find((k) => k.endsWith(":browser-plan"))!,
    ),
  );
  const notes = JSON.parse(stored!).items;
  expect(notes[0].target.position).toBeUndefined();
  expect(notes[1].target.position).toBeDefined();
  expect(notes[2].target.kind).toBe("canvas");
  await page.reload();
  expect(
    await page.evaluate(() =>
      localStorage.getItem(
        Object.keys(localStorage).find((k) => k.endsWith(":browser-plan"))!,
      ),
    ),
  ).toBe(stored);
});

test.describe("touch camera", () => {
  test.use({ hasTouch: true });
  test("pinch and swipe move the camera without adding a note", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    await read(page);
    const session = await context.newCDPSession(page);
    const old = await camera(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: 130, y: 400 },
        { x: 230, y: 400 },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: 110, y: 380 },
        { x: 250, y: 380 },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect((await camera(page)).zoom).toBeGreaterThan(old.zoom);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 180, y: 500 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 180, y: 400 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test("work-item menu searches, handles the keyboard and restores focus", async ({
  page,
}) => {
  await page.goto(route);
  const trigger = page.getByRole("button", {
    name: "Read work item",
    exact: true,
  });
  await trigger.click();
  const search = page.getByRole("combobox", { name: "Find work item" });
  await expect(search).toBeFocused();
  await search.fill("no matching title");
  await expect(
    page
      .getByRole("status", { name: "" })
      .filter({ hasText: "No matching work items." }),
  ).toBeVisible();
  await search.fill("Work item 2");
  await search.press("Enter");
  await expect(page).toHaveURL(/items\/item-2$/);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await search.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await trigger.click();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(page).toHaveURL(/items\/item-1$/);
});
