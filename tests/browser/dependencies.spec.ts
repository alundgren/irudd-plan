import { expect, test, type Page } from "@playwright/test";
import type { PlanDocument } from "../../src/web/client-api.js";
import { panTo } from "./canvas.js";

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

for (const publicView of [false, true]) {
  test(`dependency navigation preserves pending feedback in ${publicView ? "public" : "owner"} view`, async ({
    page,
  }) => {
    const data = await fixture(page, publicView);
    await page.goto(`${data.url}/items/item-1`);
    const frame = page.locator('[data-frame-item="item-1"]');
    await expect(
      page.locator('[data-frame-item="item-2"] .dependency-trigger'),
    ).toHaveCount(0);
    await frame
      .locator(".frame-heading")
      .getByRole("button", { name: "Add feedback to Work item heading" })
      .focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("textbox", { name: "Your feedback", exact: true })
      .fill("Keep my pending review");
    await page
      .getByRole("button", { name: "Add comment", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Close feedback", exact: true })
      .click();
    const before = await page.evaluate(() =>
      Object.fromEntries(
        Object.keys(localStorage).map((key) => [
          key,
          localStorage.getItem(key),
        ]),
      ),
    );
    const trigger = frame.getByRole("button", {
      name: "Depends on 2",
      exact: true,
    });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const panel = page.getByRole("dialog", {
      name: "Depends on 2",
      exact: true,
    });
    await expect(panel).toBeVisible();
    await expect(panel.locator("li button")).toHaveText([
      "Work item 2",
      "Work item 3",
    ]);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(
      `${new URL(page.url()).origin}${data.url}/items/item-2`,
    );
    await expect(page.locator(".item-sheet.selected")).toHaveAttribute(
      "data-item-id",
      "item-2",
    );
    await expect(
      page.locator('[data-frame-item="item-2"] .item-title-bar'),
    ).toBeFocused();
    expect(
      await page.evaluate(() =>
        Object.fromEntries(
          Object.keys(localStorage).map((key) => [
            key,
            localStorage.getItem(key),
          ]),
        ),
      ),
    ).toEqual(before);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Feedback 1", exact: true }).click();
    await expect(
      page.getByText("Keep my pending review", { exact: true }),
    ).toBeVisible();
  });
}

test("long titles and many prerequisites remain usable by touch and in summaries", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await fixture(page);
  const initial = data.current();
  const longTitle =
    "A long section title that remains readable when its prerequisite control wraps below the title ".repeat(
      4,
    );
  const items = Array.from({ length: 36 }, (_, index) => ({
    ...initial.plan.items[index % initial.plan.items.length]!,
    id: `item-${index + 1}`,
    title:
      index === 0
        ? longTitle
        : `Prerequisite ${index + 1} with a longer title for scrolling`,
    dependsOnItemIds:
      index === 0
        ? Array.from({ length: 35 }, (_, child) => `item-${child + 2}`)
        : [],
  }));
  await page.goto(`${data.url}/items/item-1`);
  await data.update({ ...initial, plan: { ...initial.plan, items } });
  const trigger = page.locator(
    '[data-frame-item="item-1"] .dependency-trigger',
  );
  await panTo(page, trigger);
  const heading = page.locator('[data-frame-item="item-1"] .frame-heading');
  expect(await heading.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  expect(await heading.locator(".item-title-bar").textContent()).toContain(
    longTitle.trim(),
  );
  expect(
    await heading.evaluate((el) => {
      const title = el.querySelector("h2")!;
      const control = el.querySelector<HTMLElement>(".dependency-trigger")!;
      return control.offsetTop >= title.offsetHeight;
    }),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/issue44-dependencies-header.png" });
  await trigger.tap();
  const panel = page.getByRole("dialog", { name: "Depends on 35" });
  await expect(panel.locator("li")).toHaveCount(35);
  expect(await panel.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThan(0);
  expect(box!.y).toBeGreaterThan(0);
  expect(box!.width).toBeLessThan(390);
  expect(box!.height).toBeLessThan(844);
  await page.screenshot({ path: "/tmp/issue44-dependencies-phone.png" });
  await panel.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(panel.locator("li").last()).toBeInViewport();
  await page.touchscreen.tap(2, 2);
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(page.locator(".plan-layout")).toHaveClass(/show-summaries/);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Close dependencies" }).click();
  await expect(trigger).toBeFocused();
});

test("live dependencies update and close on clearing or item removal", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto(`${data.url}/items/item-1`);
  const trigger = page.locator(
    '[data-frame-item="item-1"] .dependency-trigger',
  );
  await trigger.focus();
  await page.keyboard.press("Enter");
  const current = data.current();
  const updated = {
    ...current.plan,
    items: current.plan.items.map((item) =>
      item.id === "item-1"
        ? { ...item, dependsOnItemIds: ["item-2"] }
        : item.id === "item-2"
          ? { ...item, title: "Renamed prerequisite" }
          : item,
    ),
  };
  await data.update({ ...current, plan: updated });
  await expect(
    page.getByRole("dialog", { name: "Depends on 1" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog").locator("li button")).toHaveText([
    "Renamed prerequisite",
  ]);
  await data.update({
    ...current,
    plan: {
      ...updated,
      items: updated.items.map((item) => ({ ...item, dependsOnItemIds: [] })),
    },
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toHaveCount(0);
  await data.update({ ...current, plan: updated });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await data.update({
    ...current,
    plan: {
      ...updated,
      items: updated.items.filter((item) => item.id !== "item-1"),
    },
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/work item.*deleted/i)).toBeVisible();
});

test("access failure replaces an open dependency panel with the existing error", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto(`${data.url}/items/item-1`);
  await page.locator('[data-frame-item="item-1"] .dependency-trigger').focus();
  await page.keyboard.press("Enter");
  await page.route("**/api/plans/browser-plan", (route) =>
    route.fulfill({ status: 403, json: { error: "Plan access denied" } }),
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  await expect(
    page.getByText("Plan access denied", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
