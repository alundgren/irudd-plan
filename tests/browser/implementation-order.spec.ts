import { expect, test, type Page } from "@playwright/test";
import type { PlanDocument } from "../../src/web/client-api.js";

test.use({ hasTouch: true });

async function fixture(page: Page, publicView = false) {
  const response = await page.request.get("/api/plans/browser-plan");
  const original = (await response.json()) as PlanDocument;
  let document: PlanDocument = {
    ...original,
    plan: {
      ...original.plan,
      items: original.plan.items.map((item, index) =>
        index === 0
          ? { ...item, dependsOnItemIds: ["item-3", "item-2"] }
          : item,
      ),
    },
  };
  const path = publicView
    ? "/public/plans/owner-a/browser-plan/document"
    : "/api/plans/browser-plan";
  await page.route(`**${path}`, (route) => route.fulfill({ json: document }));
  return {
    url: publicView
      ? "/public/plans/owner-a/browser-plan"
      : "/plans/browser-plan",
    current: () => document,
    async update(next: PlanDocument) {
      document = { ...next, version: document.version + 1 };
      await page.evaluate(() => {
        window.dispatchEvent(new Event("offline"));
        window.dispatchEvent(new Event("online"));
      });
      await expect(page.locator(".review-app")).toHaveAttribute(
        "data-version",
        String(document.version),
      );
    },
  };
}

const toggle = (page: Page) =>
  page.getByRole("button", { name: "Implementation order", exact: true });
const node = (page: Page, id: string) =>
  page.locator(`[data-order-item="${id}"]`);
const arrows = (page: Page) => page.locator(".order-arrows > path");

for (const publicView of [false, true]) {
  test(`order inspection and ordinary navigation preserve feedback and camera in ${publicView ? "public" : "owner"} view`, async ({
    page,
  }) => {
    const data = await fixture(page, publicView);
    await page.goto(`${data.url}/items/item-1`);
    await page
      .locator('[data-frame-item="item-1"] .frame-heading')
      .getByRole("button", { name: "Add feedback to Work item heading" })
      .focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("textbox", { name: "Your feedback", exact: true })
      .fill("Preserve this draft across order navigation");
    await page
      .getByRole("button", { name: "Add comment", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Close feedback", exact: true })
      .click();
    await page.locator(".plan-viewport").focus();
    await page.keyboard.press("ArrowDown");
    const transform = await page
      .locator(".plan-layout")
      .evaluate((el) => (el as HTMLElement).style.transform);
    await toggle(page).click();
    await expect(
      page.getByRole("heading", { name: "Implementation order", exact: true }),
    ).toBeFocused();
    await expect(arrows(page)).toHaveCount(0);
    await node(page, "item-1").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${data.url}/items/item-1$`));
    await expect(arrows(page)).toHaveCount(2);
    await expect(
      page
        .getByRole("list", { name: "Prerequisites", exact: true })
        .locator("button"),
    ).toHaveText(["Work item 2", "Work item 3"]);
    await expect(arrows(page).first()).toHaveAttribute("data-to", "item-1");
    await expect(node(page, "item-2")).toHaveClass(/prerequisite/);
    await toggle(page).click();
    await expect(page.locator(".plan-layout")).toBeVisible();
    expect(
      await page
        .locator(".plan-layout")
        .evaluate((el) => (el as HTMLElement).style.transform),
    ).toBe(transform);
    await toggle(page).click();
    await expect(node(page, "item-1")).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("list", { name: "Prerequisites", exact: true })
      .getByRole("button", { name: "Work item 2", exact: true })
      .click();
    await expect(node(page, "item-2")).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Open item", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${data.url}/items/item-2$`));
    await expect(
      page.locator('[data-frame-item="item-2"] .item-title-bar'),
    ).toBeFocused();
    await expect(page.locator(".item-sheet.selected")).toHaveAttribute(
      "data-item-id",
      "item-2",
    );
    await toggle(page).click();
    await expect(node(page, "item-2")).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Feedback 1", exact: true }).click();
    await expect(
      page.getByText("Preserve this draft across order navigation", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Clear selection", exact: true })
      .click();
    await expect(arrows(page)).toHaveCount(0);
    await page.locator(".feedback-location").click();
    await expect(page.locator(".implementation-order")).toBeHidden();
    await expect(page.locator(".item-sheet.selected")).toHaveAttribute(
      "data-item-id",
      "item-1",
    );
    await expect(page.locator(".canvas-feedback-pin").first()).toBeVisible();
  });
}

test("live edits recompute exact steps and skipped edges, retain scroll and explain invalid/removed data", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto(`${data.url}/items/item-1`);
  const initial = data.current();
  const items = initial.plan.items.map((item, index) => ({
    ...item,
    dependsOnItemIds:
      index === 0 ? [] : index === 3 ? ["item-1", "item-3"] : [`item-${index}`],
  }));
  await data.update({ ...initial, plan: { ...initial.plan, items } });
  await toggle(page).click();
  await node(page, "item-1").click();
  await expect(arrows(page)).toHaveCount(2);
  await expect(
    page
      .getByRole("region", { name: "Step 4", exact: true })
      .locator("[data-order-item]"),
  ).toHaveAttribute("data-order-item", "item-4");
  await expect(
    page.locator('.order-arrows > path[data-from="item-1"][data-to="item-4"]'),
  ).toHaveAttribute("d", /^M /);
  await page.locator(".order-graph-scroll").evaluate((el) => {
    el.scrollLeft = 400;
  });
  const scroll = await page
    .locator(".order-graph-scroll")
    .evaluate((el) => el.scrollLeft);
  await data.update({
    ...initial,
    plan: {
      ...initial.plan,
      items: items.map((item) => ({ ...item, title: `Renamed ${item.id}` })),
    },
  });
  await expect(node(page, "item-1")).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.locator(".order-graph-scroll").evaluate((el) => el.scrollLeft),
  ).toBe(scroll);
  await toggle(page).click();
  await toggle(page).click();
  expect(
    await page.locator(".order-graph-scroll").evaluate((el) => el.scrollLeft),
  ).toBe(scroll);
  await data.update({
    ...initial,
    plan: {
      ...initial.plan,
      items: items.map((item) => ({ ...item, dependsOnItemIds: [] })),
    },
  });
  await expect(page.locator(".order-step")).toHaveCount(1);
  await expect(arrows(page)).toHaveCount(0);
  await data.update({
    ...initial,
    plan: {
      ...initial.plan,
      items: initial.plan.items.filter((item) => item.id !== "item-1"),
    },
  });
  await expect(page.getByText(/selected item was removed/)).toBeVisible();
  await data.update({
    ...initial,
    plan: {
      ...initial.plan,
      items: [{ ...items[0]!, dependsOnItemIds: ["missing"] }],
    },
  });
  await expect(page.getByRole("alert")).toContainText(
    "Implementation order unavailable",
  );
  await expect(page.locator(".order-step")).toHaveCount(0);
  await data.update({ ...initial, plan: { ...initial.plan, items: [] } });
  await expect(page.getByText(/No work items yet/)).toBeVisible();
  await data.update({
    ...initial,
    plan: { ...initial.plan, items: [items[0]!] },
  });
  await expect(page.locator(".order-step")).toHaveCount(1);
});

test("large graph has readable desktop and 390px lists, keyboard selection and no overlapping labels", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto(data.url);
  const initial = data.current();
  const items = Array.from({ length: 61 }, (_, index) => ({
    ...initial.plan.items[index % initial.plan.items.length]!,
    id: `large-${index}`,
    title: `Item ${index}: A readable title with enough detail to wrap across several lines`,
    dependsOnItemIds:
      index === 60
        ? Array.from(
            { length: 60 },
            (_, prerequisite) => `large-${prerequisite}`,
          )
        : [],
  }));
  await data.update({ ...initial, plan: { ...initial.plan, items } });
  await toggle(page).click();
  await node(page, "large-60").focus();
  await page.keyboard.press("Space");
  await expect(arrows(page)).toHaveCount(60);
  const list = page.getByRole("list", { name: "Prerequisites", exact: true });
  await expect(list.locator("button")).toHaveCount(60);
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await page.screenshot({ path: "/tmp/issue45-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".order-arrows")).toBeHidden();
  expect(
    await page
      .locator(".implementation-order")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  expect(
    await node(page, "large-0").evaluate(
      (el) => el.scrollWidth <= el.clientWidth,
    ),
  ).toBe(true);
  expect(
    await node(page, "large-0").evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe("16px");
  await page.locator(".implementation-order").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: "/tmp/issue45-phone.png" });
  await node(page, "large-0").scrollIntoViewIfNeeded();
  await expect(page.locator(".review-header")).toBeInViewport();
  const first = await node(page, "large-0").boundingBox();
  const second = await node(page, "large-1").boundingBox();
  expect(first!.y + first!.height).toBeLessThan(second!.y);
  await page.screenshot({ path: "/tmp/issue45-phone-steps.png" });
  await list.locator("button").last().focus();
  await page.keyboard.press("Enter");
  await expect(node(page, "large-59")).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByRole("list", { name: "Dependents", exact: true })
      .locator("button"),
  ).toHaveText([items[60]!.title]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("unavailable refresh never presents a current dependency order and access denial uses recovery", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto(data.url);
  const current = data.current();
  await data.update({
    ...current,
    plan: {
      ...current.plan,
      items: current.plan.items.map((item, index) => ({
        ...item,
        dependsOnItemIds: index === 0 ? [] : [`item-${index}`],
      })),
    },
  });
  await toggle(page).click();
  await node(page, "item-1").click();
  await page.locator(".order-graph-scroll").evaluate((el) => {
    el.scrollLeft = 400;
  });
  const scroll = await page
    .locator(".order-graph-scroll")
    .evaluate((el) => el.scrollLeft);
  expect(scroll).toBeGreaterThan(0);
  await page.route("**/api/plans/browser-plan", (route) =>
    route.fulfill({ status: 500, json: { error: "Refresh failed" } }),
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  await expect(page.getByRole("alert")).toContainText("Refresh failed");
  await expect(page.locator(".order-graph-scroll")).toBeHidden();
  await page.route("**/api/plans/browser-plan", (route) =>
    route.fulfill({ json: data.current() }),
  );
  await data.update(data.current());
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(node(page, "item-1")).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.locator(".order-graph-scroll").evaluate((el) => el.scrollLeft),
  ).toBe(scroll);
  await page.route("**/api/plans/browser-plan", (route) =>
    route.fulfill({ status: 403, json: { error: "Plan access denied" } }),
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  await expect(
    page.getByRole("heading", { name: "Plan unavailable" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
