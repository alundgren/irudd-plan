import { chooseItem } from "./canvas.js";
import { expect, test } from "@playwright/test";
import type { PlanDocument } from "../../src/web/client-api.js";

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
  ).toBeInViewport();
  await page.getByRole("button", { name: "Feedback 2", exact: true }).click();
  await page.locator(".feedback-location").first().click();
  await expect(
    page.locator('[data-section="item-1:requirements"]'),
  ).toBeInViewport();
  await page.locator(".feedback-location").nth(1).click();
  await expect(
    page.getByRole("button", { name: "Open canvas feedback 2" }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).items,
      key,
    ),
  ).toEqual(notes);
  await page
    .locator(".plan-viewport")
    .dispatchEvent("wheel", { shiftKey: true, deltaY: 160 });
  const position = () =>
    page
      .locator(".plan-layout")
      .evaluate((element) => getComputedStyle(element).transform);
  const beforeRevision = await position();
  await page.route("**/api/plans/browser-plan", async (route) => {
    const response = await route.fetch();
    const current = await response.json();
    await route.fulfill({ json: { ...current, version: current.version + 1 } });
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  await expect(page.locator(".review-app")).toHaveAttribute(
    "data-version",
    "2",
  );
  expect(await position()).toBe(beforeRevision);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open canvas feedback 2" }),
  ).toBeInViewport();
});

test("keyboard heading feedback retains the original item target", async ({
  page,
}) => {
  await page.goto("/plans/browser-plan/items/item-1");
  const action = page
    .locator('[data-frame-item="item-1"] .frame-heading')
    .getByRole("button", {
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

test("tool shortcuts work after using the chooser and canvas controls", async ({
  page,
}) => {
  await page.goto("/plans/browser-plan");
  const comment = page.getByRole("button", { name: "Comment", exact: true });
  const pan = page.getByRole("button", { name: "Pan", exact: true });
  await chooseItem(page, "Work item 1");
  const chooser = page.getByRole("button", {
    name: "Read work item",
    exact: true,
  });
  await expect(chooser).toBeFocused();
  await page.keyboard.press("v");
  await expect(pan).toHaveAttribute("aria-pressed", "true");
  await expect(chooser).toBeFocused();
  await page.keyboard.press("c");
  await expect(comment).toHaveAttribute("aria-pressed", "true");
  await pan.click();
  await page.keyboard.press("c");
  await expect(comment).toHaveAttribute("aria-pressed", "true");
  await comment.click();
  await page.keyboard.press("v");
  await expect(pan).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.keyboard.press("c");
  await expect(comment).toHaveAttribute("aria-pressed", "true");
});

test("tool shortcuts preserve typing, dialogs, and modified keys", async ({
  page,
}) => {
  await page.goto("/plans/browser-plan");
  const comment = page.getByRole("button", { name: "Comment", exact: true });
  await page
    .getByRole("button", { name: "Read work item", exact: true })
    .click();
  const search = page.getByRole("combobox", { name: "Find work item" });
  await page.keyboard.type("cv");
  await expect(search).toHaveValue("cv");
  await expect(comment).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  for (const key of ["Control+v", "Meta+v", "Alt+v"]) {
    await page.keyboard.press(key);
    await expect(comment).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByRole("button", { name: "Comment on canvas center" }).focus();
  await page.keyboard.press("Enter");
  const feedback = page.getByRole("textbox", {
    name: "Your feedback",
    exact: true,
  });
  await feedback.fill("cv");
  await expect(feedback).toHaveValue("cv");
  await page.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("v");
  await expect(comment).toHaveAttribute("aria-pressed", "true");
});

test("feedback tracking survives a render and stops after user navigation", async ({
  page,
}) => {
  await page.goto("/plans/browser-plan/items/item-1");
  const section = page.locator('[data-section="item-1:requirements"]');
  await section
    .getByRole("button", { name: "Add feedback to Requirements" })
    .focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("textbox", { name: "Your feedback", exact: true })
    .fill("Keep this target visible");
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  await page.locator(".feedback-location").first().click();
  await page
    .getByRole("button", { name: "Close feedback", exact: true })
    .click();
  const offset = () =>
    section.evaluate(
      (el) =>
        el.getBoundingClientRect().top -
        document.querySelector(".plan-viewport")!.getBoundingClientRect().top,
    );
  await expect.poll(offset).toBeCloseTo(24, 0);
  const initialOffset = await offset();
  const goal = page.locator('[data-section="item-1:goal"]');
  await goal.evaluate(
    (el) => ((el as HTMLElement).style.paddingBottom = "400px"),
  );
  await expect
    .poll(async () => Math.abs((await offset()) - initialOffset))
    .toBeLessThan(1);
  const view = page.locator(".plan-viewport");
  await view.dispatchEvent("wheel", { deltaY: 100 });
  await goal.evaluate(
    (el) => ((el as HTMLElement).style.paddingBottom = "800px"),
  );
  await expect.poll(offset).toBeGreaterThan(300);
  const beforeRevision = await offset();
  await page.route("**/api/plans/browser-plan", async (route) => {
    const response = await route.fetch();
    const document = await response.json();
    await route.fulfill({
      json: {
        ...document,
        version: document.version + 1,
        plan: {
          ...document.plan,
          epicGoal: `${document.plan.epicGoal} Updated.`,
        },
      },
    });
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  await expect(page.locator(".review-app")).toHaveAttribute(
    "data-version",
    "2",
  );
  expect(await offset()).toBeCloseTo(beforeRevision, 0);
});

test("browser Back cancels feedback tracking before a viewport resize", async ({
  page,
}) => {
  await page.goto("/plans/browser-plan");
  await page
    .getByRole("button", { name: "Read work item", exact: true })
    .click();
  await page.getByRole("option", { name: "Work item 1", exact: true }).click();
  await expect(page).toHaveURL(/\/items\/item-1$/);
  await page
    .locator('[data-section="item-1:goal"]')
    .getByRole("button", { name: "Add feedback to Goal" })
    .focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("textbox", { name: "Your feedback", exact: true })
    .fill("Track this goal");
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  await page.locator(".feedback-location").first().click();
  await page
    .getByRole("button", { name: "Close feedback", exact: true })
    .click();
  await page.goBack();
  await expect(page).toHaveURL(/\/plans\/browser-plan$/);
  await page.setViewportSize({ width: 800, height: 900 });
  const zoom = () =>
    page
      .locator(".plan-layout")
      .evaluate(
        (element) => new DOMMatrix(getComputedStyle(element).transform).a,
      );
  await expect.poll(zoom).toBeLessThan(0.45);
  await expect(
    page.getByRole("button", { name: "Read work item", exact: true }),
  ).toContainText("Epic goal");
});

test("chooser navigation cancels feedback tracking across live revisions", async ({
  page,
}) => {
  await page.goto("/plans/browser-plan/items/item-1");
  await page
    .locator('[data-section="item-1:requirements"]')
    .getByRole("button", { name: "Add feedback to Requirements" })
    .focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("textbox", { name: "Your feedback", exact: true })
    .fill("Review this requirement");
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  await page.locator(".feedback-location").first().click();
  await chooseItem(page, "Work item 2");
  const selected = page.locator(".item-sheet.selected");
  await expect(selected).toHaveAttribute("data-item-id", "item-2");
  const before = await selected.boundingBox();
  await page.route("**/api/plans/browser-plan", async (route) => {
    const response = await route.fetch();
    const document = await response.json();
    document.version += 1;
    document.plan.epicGoal += " Updated.";
    await route.fulfill({ response, json: document });
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  await expect(page.locator(".review-app")).toHaveAttribute(
    "data-version",
    "2",
  );
  await expect(page).toHaveURL(/items\/item-2$/);
  await expect(selected).toHaveAttribute("data-item-id", "item-2");
  expect((await selected.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  await expect(selected).toBeInViewport();
});
