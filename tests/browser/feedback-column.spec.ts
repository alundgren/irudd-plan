import { expect, test, type Page } from "@playwright/test";
import type { PlanDocument } from "../../src/web/client-api.js";
import {
  buildRevisionPrompt,
  type FeedbackItem,
} from "../../src/web/feedback.js";

async function seedNotes(page: Page, count: number) {
  const response = await page.request.get("/api/plans/browser-plan");
  const document = (await response.json()) as PlanDocument;
  const items: FeedbackItem[] = Array.from({ length: count }, (_, index) => ({
    id: `local-note-${index}`,
    planId: document.plan.planId,
    observedVersion: document.version,
    createdAt: "2026-09-07T00:00:00Z",
    target:
      index === 0
        ? {
            kind: "section",
            itemId: "item-1",
            sectionId: "requirements",
            label: "Requirements",
            originalText: document.plan.items[0]!.requirements.join("\n"),
            originalExcerpt: document.plan.items[0]!.requirements[0]!,
            excerptOccurrence: 1,
          }
        : { kind: "canvas", x: 200 + index * 10, y: 200 },
    requestedChange:
      index === 1
        ? "A long note with a readable explanation. ".repeat(80)
        : `Keep draft ${index + 1} intact.`,
  }));
  const key = `irudd-plan:feedback:v1:${document.feedbackScope}:${document.plan.planId}`;
  await page.goto("/plans/browser-plan");
  await page.evaluate(
    ({ key, items }) => localStorage.setItem(key, JSON.stringify({ items })),
    { key, items },
  );
  await page.reload();
  return { document, items, key };
}

for (const width of [1440, 390]) {
  test(`feedback list and drafts stay usable at ${width}px`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(40_000);
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const { document, items, key } = await seedNotes(page, 24);
    const toggle = page.getByRole("button", {
      name: "Feedback 24",
      exact: true,
    });
    await toggle.click();
    const panel = page.getByRole("complementary", { name: "Pending feedback" });
    await expect(panel.getByRole("textbox")).toHaveCount(0);
    await expect(
      panel.getByRole("heading", { name: "Pending feedback 24" }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("long-note.png") });
    const heading = await panel.locator(".feedback-heading").boundingBox();
    const footer = await panel.locator(".feedback-copy").boundingBox();
    const bounds = await panel.boundingBox();
    const canvas = await page.locator(".plan-viewport").boundingBox();
    expect(bounds!.width).toBe(330);
    const header = await page.locator(".review-header").boundingBox();
    expect(bounds!.y).toBe(header!.y + header!.height);
    if (width === 1440) expect(canvas!.x + canvas!.width).toBe(bounds!.x);
    await panel
      .getByRole("button", { name: "Remove feedback 24", exact: true })
      .scrollIntoViewIfNeeded();
    expect(await panel.locator(".feedback-heading").boundingBox()).toEqual(
      heading,
    );
    expect(await panel.locator(".feedback-copy").boundingBox()).toEqual(footer);
    await expect(
      panel.getByRole("button", { name: "Copy feedback (24)", exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("many-notes.png") });
    await panel
      .getByRole("button", { name: "Copy feedback (24)", exact: true })
      .click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      buildRevisionPrompt(document.plan, document.version, items),
    );
    expect(
      JSON.parse(
        (await page.evaluate((key) => localStorage.getItem(key), key))!,
      ).items,
    ).toEqual(items);
    await panel
      .getByRole("button", { name: "Edit feedback 24", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Your feedback", exact: true })
      .fill("Saved edit stays while selecting another note.");
    await page
      .getByRole("button", { name: "Save comment", exact: true })
      .click();
    await panel
      .getByRole("button", {
        name: "1. Work item 1 · Requirements",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/items\/item-1$/);
    const section = page.locator(
      '.plan-sheet.selected [data-section="item-1:requirements"]',
    );
    await expect
      .poll(
        async () =>
          (await section.boundingBox())!.y -
          (await page.locator(".plan-viewport").boundingBox())!.y,
      )
      .toBeCloseTo(24, 0);
    await expect(panel.locator(".feedback-editor").first()).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath("selected-location.png"),
    });
    await expect(panel).toContainText(
      "Saved edit stays while selecting another note.",
    );
    await panel.getByRole("button", { name: "Close feedback" }).click();
    await toggle.click();
    await expect(panel.getByRole("textbox")).toHaveCount(0);
    await expect(panel).toContainText(
      "Saved edit stays while selecting another note.",
    );
    await panel
      .getByRole("button", { name: "Remove feedback 24", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Feedback 23", exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "Feedback 23", exact: true })
      .click();
    await expect(panel.locator(".feedback-editor")).toHaveCount(23);
    await panel.getByRole("button", { name: "Close feedback" }).click();
    await page.goto("/public/plans/owner-a/browser-plan");
    await page.getByRole("button", { name: "Feedback 0", exact: true }).click();
    await expect(panel).toContainText("Click a sentence");
    await expect(
      panel.getByRole("button", { name: "Copy feedback", exact: true }),
    ).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath("empty-public.png") });
    await page.goto("/plans/browser-plan");
    await expect(
      page.getByRole("button", { name: "Feedback 23", exact: true }),
    ).toBeVisible();
  });

  test(`missing targets and failed saving remain recoverable at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    const { items, key } = await seedNotes(page, 2);
    const missing: FeedbackItem = {
      ...items[0]!,
      id: "missing",
      target: {
        kind: "section",
        itemId: "removed",
        sectionId: "goal",
        label: "Goal",
        originalText: "Removed goal",
        originalExcerpt: "Removed goal",
        excerptOccurrence: 1,
      },
    };
    const changed: FeedbackItem = {
      ...items[0]!,
      target: {
        ...items[0]!.target,
        kind: "section",
        itemId: "item-1",
        sectionId: "requirements",
        label: "Requirements",
        originalText: "Earlier requirements",
        originalExcerpt: "Earlier requirements",
        excerptOccurrence: 1,
      },
    };
    await page.evaluate(
      ({ key, items }) => localStorage.setItem(key, JSON.stringify({ items })),
      { key, items: [missing, changed] },
    );
    await page.reload();
    await page.getByRole("button", { name: "Feedback 2", exact: true }).click();
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error("Storage full");
      };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error("Denied")) },
      });
    });
    const panel = page.locator(".feedback-panel");
    const viewport = page.locator(".plan-viewport");
    await viewport.press("ArrowRight");
    const before = await viewport.evaluate((el) =>
      String(
        new DOMMatrix(
          getComputedStyle(el.querySelector(".plan-layout")!).transform,
        ).f,
      ),
    );
    await panel
      .getByRole("button", { name: "1. Removed work item · Goal", exact: true })
      .click();
    await expect(panel).toContainText(
      "This location is no longer in the plan.",
    );
    expect(
      await viewport.evaluate((el) =>
        String(
          new DOMMatrix(
            getComputedStyle(el.querySelector(".plan-layout")!).transform,
          ).f,
        ),
      ),
    ).toBe(before);
    await expect(panel).toContainText(
      "This location has changed since you commented.",
    );
    await panel
      .getByRole("button", { name: "Edit feedback 1", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Your feedback", exact: true })
      .fill("Recover this comment even when storage is full.");
    await page
      .getByRole("button", { name: "Save comment", exact: true })
      .click();
    await expect(panel).toContainText("Your changes are in memory");
    await panel
      .getByRole("button", { name: "Copy feedback (2)", exact: true })
      .click();
    const manual = panel.getByRole("textbox", {
      name: "Agent prompt for manual copy",
    });
    await expect(manual).toBeInViewport();
    await expect(manual).toHaveValue(/Recover this comment/);
    await expect(
      panel.getByRole("button", { name: "Close feedback" }),
    ).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("recovery.png") });
    await panel.getByRole("button", { name: "Close feedback" }).click();
    await page.getByRole("button", { name: "Feedback 2", exact: true }).click();
    await expect(panel).toContainText(
      "Recover this comment even when storage is full.",
    );
  });
}

test("Fit all uses the canvas beside the column and a pin selects its note", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedNotes(page, 3);
  await page.getByRole("button", { name: "Feedback 3", exact: true }).click();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  const canvas = (await page.locator(".plan-viewport").boundingBox())!;
  for (const sheet of await page.locator(".plan-sheet").all()) {
    const bounds = (await sheet.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(canvas.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      canvas.x + canvas.width + 1,
    );
  }
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Close feedback" }).click();
  await page
    .getByRole("button", { name: "Open canvas feedback 3", exact: true })
    .dispatchEvent("click");
  await expect(page.locator(".feedback-editor.selected")).toContainText(
    "Keep draft 3 intact.",
  );
  await expect(page.locator(".feedback-editor.selected")).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Open canvas feedback 3", exact: true }),
  ).toBeInViewport();
  await page.locator(".feedback-list").evaluate((list) => {
    list.scrollTop = 0;
  });
  await page
    .getByRole("button", { name: "Open canvas feedback 3", exact: true })
    .dispatchEvent("click");
  await expect(page.locator(".feedback-editor.selected")).toBeInViewport();
});

test("a listed overview location restores reading zoom after Fit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { items, key, document } = await seedNotes(page, 1);
  const note: FeedbackItem = {
    ...items[0]!,
    target: {
      kind: "section",
      sectionId: "epic-goal",
      label: "Epic goal",
      originalText: document.plan.epicGoal,
      originalExcerpt: document.plan.epicGoal,
      excerptOccurrence: 1,
    },
  };
  await page.evaluate(
    ({ key, note }) =>
      localStorage.setItem(key, JSON.stringify({ items: [note] })),
    { key, note },
  );
  await page.reload();
  const toggle = page.getByRole("button", { name: "Feedback 1", exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(page.locator(".feedback-panel")).toHaveCount(0);
  await toggle.click();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page
    .getByRole("button", { name: "1. Plan overview · Epic goal", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await page.locator(".plan-sheet.selected").boundingBox())!.width,
    )
    .toBeGreaterThan(600);
  const section = page.locator(
    '.plan-sheet.selected [data-section="epic-goal"]',
  );
  await expect
    .poll(
      async () =>
        (await section.boundingBox())!.y -
        (await page.locator(".plan-viewport").boundingBox())!.y,
    )
    .toBeCloseTo(24, 0);
});
