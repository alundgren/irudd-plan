import { expect, test, type Page } from "@playwright/test";
import { openReference, panTo } from "./canvas.js";

async function saveComment(page: Page, text: string) {
  await page
    .getByRole("textbox", { name: "Your feedback", exact: true })
    .fill(text);
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function notes(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) =>
      entry.endsWith(":browser-plan"),
    );
    return key === undefined
      ? []
      : JSON.parse(localStorage.getItem(key)!).items;
  });
}

test("click, cancel, keyboard entry and edit preserve the actual target", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/plans/browser-plan/items/item-1");
  const goal = page
    .locator('.item-sheet.selected [data-section="item-1:goal"] .rich-text')
    .first();
  await goal.click();
  await page
    .getByRole("dialog")
    .screenshot({ path: "docs/captures/comment-dialog.png" });
  await expect(
    page.getByRole("textbox", { name: "Your feedback", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: "About", exact: true }),
  ).toHaveValue("Work item 1 · Goal");
  await page
    .getByRole("textbox", { name: "Your feedback", exact: true })
    .fill("Do not save this");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await notes(page)).toEqual([]);
  await expect(page.locator(".canvas-comments")).toBeFocused();
  await goal.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await notes(page)).toEqual([]);
  const action = page
    .locator(".item-sheet.selected")
    .getByRole("button", { name: "Add feedback to Goal", exact: true });
  await action.focus();
  await expect(action).toBeVisible();
  await page.keyboard.press("Enter");
  await saveComment(page, "Keep this original target");
  await page.screenshot({ path: "docs/captures/comment-desktop.png" });
  const original = (await notes(page))[0];
  await page
    .getByRole("button", { name: "Edit feedback 1", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "About", exact: true })
    .fill("A clearer subject");
  await page
    .getByRole("textbox", { name: "Your feedback", exact: true })
    .pressSequentially("cv typed inside the dialog");
  await expect(
    page.getByRole("button", { name: "Comment", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Save comment", exact: true }).click();
  const edited = (await notes(page))[0];
  expect(edited.target).toEqual(original.target);
  expect(edited.observedVersion).toBe(original.observedVersion);
  expect(edited.subject).toBe("A clearer subject");
  await page
    .getByRole("button", { name: "Edit feedback 1", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your feedback", exact: true })
    .fill("Cancelled edit");
  await page.keyboard.press("Escape");
  expect((await notes(page))[0]).toEqual(edited);
  await expect(
    page.getByRole("button", { name: "Edit feedback 1", exact: true }),
  ).toBeFocused();
});

test("tools distinguish dragging, text selection, controls and visual interaction", async ({
  page,
}) => {
  await page.goto("/plans/browser-plan/items/item-1");
  await page.locator(".canvas-comments").focus();
  await page.keyboard.press("v");
  await expect(
    page.getByRole("button", { name: "Pan", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const goal = page.locator(
    '.item-sheet.selected [data-section="item-1:goal"]',
  );
  const before = await goal.boundingBox();
  await page.mouse.move(before!.x + 50, before!.y + 40);
  await page.mouse.down();
  await page.mouse.move(before!.x + 70, before!.y - 40, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await goal.boundingBox())!.y).toBeCloseTo(before!.y - 80, 0);
  await page.locator(".canvas-comments").focus();
  await page.keyboard.press("c");
  const text = goal.locator(".rich-text").first();
  await text.evaluate((element) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  const bounds = await text.boundingBox();
  await page.mouse.move(bounds!.x + 20, bounds!.y + 8);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 150, bounds!.y + 8, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await text.dblclick();
  await page.waitForTimeout(350);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await openReference(page, "Interactive review control");
  await expect(
    page.locator(".reference-sheet.selected .visual-comment-overlay"),
  ).toBeVisible();
  await page
    .locator(".reference-sheet.selected .visual-comment-overlay")
    .click({ position: { x: 80, y: 40 } });
  await saveComment(page, "Visual point");
  expect((await notes(page))[0].target.kind).toBe("asset");
  await page.getByRole("button", { name: "Close feedback" }).click();
  await page.getByRole("button", { name: "Pan", exact: true }).click();
  await expect(page.locator(".visual-comment-overlay")).toHaveCount(0);
  const reference = page.locator(".reference-sheet.selected");
  const action = reference.getByRole("button", {
    name: "Add feedback to visual Interactive review control",
    exact: true,
  });
  await page.keyboard.press("Tab");
  await action.focus();
  await expect(action).toHaveCSS("clip-path", "none");
  const actionBounds = (await action.boundingBox())!;
  const frameBounds = (await reference.locator(".asset-frame").boundingBox())!;
  expect(actionBounds.x).toBeGreaterThanOrEqual(frameBounds.x);
  expect(actionBounds.y).toBeGreaterThanOrEqual(frameBounds.y);
  expect(actionBounds.x + actionBounds.width).toBeLessThanOrEqual(
    frameBounds.x + frameBounds.width,
  );
  expect(actionBounds.y + actionBounds.height).toBeLessThanOrEqual(
    frameBounds.y + frameBounds.height,
  );

  const mockup = page
    .locator(".reference-sheet.selected")
    .frameLocator("iframe");
  await mockup.getByRole("button", { name: "Reviewed 0 times" }).click();
  await expect(
    mockup.getByRole("button", { name: "Reviewed 1 time" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("normalized pins follow zoom and relayout; Fit and reset work with dock open", async ({
  page,
}) => {
  await page.goto("/plans/browser-plan/items/item-1");
  const goal = page.locator(
    '.item-sheet.selected [data-section="item-1:goal"]',
  );
  await goal.locator(".rich-text").first().click();
  await saveComment(page, "Positioned section note");
  const stored = (await notes(page))[0];
  const pin = page.getByRole("button", { name: "Open section feedback 1" });
  const checkPosition = async () => {
    const section = (await goal.boundingBox())!;
    const marker = (await pin.boundingBox())!;
    expect(marker.width).toBeCloseTo(32, 0);
    expect(marker.height).toBeCloseTo(32, 0);
    expect((marker.x + 6 - section.x) / section.width).toBeCloseTo(
      stored.target.position.x,
      2,
    );
    expect((marker.y + marker.height - section.y) / section.height).toBeCloseTo(
      stored.target.position.y,
      2,
    );
  };
  await expect(pin).toBeVisible();
  await checkPosition();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await checkPosition();
  await goal.evaluate(
    (element) => ((element as HTMLElement).style.paddingBottom = "120px"),
  );
  await checkPosition();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  const canvas = (await page.locator(".react-flow").boundingBox())!;
  for (const sheet of await page.locator(".plan-sheet").all()) {
    const bounds = (await sheet.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(canvas.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      canvas.x + canvas.width,
    );
  }
  await page.getByTitle("Reset to 100%", { exact: true }).click();
  await expect(page.getByTitle("Reset to 100%", { exact: true })).toHaveText(
    "100%",
  );
  await page.reload();
  expect((await notes(page))[0]).toEqual(stored);
});

test("keyboard action captures the second repeated excerpt without a selection-created draft", async ({
  page,
}) => {
  await page.route("**/api/plans/browser-plan", async (route) => {
    const response = await route.fetch();
    const document = await response.json();
    document.plan.items[0].requirements = ["Repeated words", "Repeated words"];
    await route.fulfill({ response, json: document });
  });
  await page.goto("/plans/browser-plan/items/item-1");
  const section = page.locator(
    '.item-sheet.selected [data-section="item-1:requirements"]',
  );
  await panTo(page, section);
  await section
    .locator("li span")
    .nth(1)
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  expect(await notes(page)).toEqual([]);
  await section
    .getByRole("button", { name: "Add feedback to Requirements" })
    .focus();
  await page.keyboard.press("Enter");
  await saveComment(page, "Second occurrence only");
  const target = (await notes(page))[0].target;
  expect(target.originalExcerpt).toBe("Repeated words");
  expect(target.excerptOccurrence).toBe(2);
});

test("blank canvas coordinates and subjects survive mixed old/new storage and manual copy on phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("Clipboard unavailable")),
      },
    });
  });
  await page.goto("/plans/browser-plan/items/item-1");
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  const canvas = (await page.locator(".react-flow").boundingBox())!;
  const click = { x: canvas.x + 5, y: canvas.y + canvas.height / 2 };
  await page.mouse.click(click.x, click.y);
  await page
    .getByRole("textbox", { name: "About", exact: true })
    .fill("Rollout order in the open space");
  await saveComment(page, "Temporary blank note");
  const original = (await notes(page))[0];
  expect(original.target.kind).toBe("canvas");
  await page.screenshot({ path: "docs/captures/comment-narrow.png" });
  await page.getByRole("button", { name: "Close feedback" }).click();
  const pin = page.getByRole("button", { name: "Open canvas feedback 1" });
  await expect(pin).toBeInViewport();
  await pin.click();
  await expect(page.locator(".feedback-editor.selected")).toContainText(
    "Rollout order in the open space",
  );
  await page.getByRole("button", { name: "Copy feedback (1)" }).click();
  const prompt = page.getByRole("textbox", {
    name: "Agent prompt for manual copy",
  });
  await expect(prompt).toHaveValue(/About: "Rollout order in the open space"/);
  await expect(prompt).toHaveValue(/Original location: x=/);
  await expect(prompt).toHaveValue(/check_packet/);
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) =>
      entry.endsWith(":browser-plan"),
    )!;
    const state = JSON.parse(localStorage.getItem(key)!);
    const old = {
      ...state.items[0],
      id: "legacy-note",
      requestedChange: "An old unpositioned section note",
      target: {
        kind: "section",
        itemId: "item-1",
        sectionId: "goal",
        label: "Goal",
        originalText: "Old goal",
        originalExcerpt: "Old goal",
        excerptOccurrence: 1,
      },
    };
    delete old.subject;
    state.items.push(old);
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  const retained = await notes(page);
  expect(retained).toHaveLength(2);
  expect(retained[0]).toEqual(original);
  expect(retained[1].requestedChange).toBe("An old unpositioned section note");
  await page.getByRole("button", { name: "Feedback 2", exact: true }).click();
  await expect(page.locator(".feedback-panel")).toContainText(
    "This location has changed",
  );
  await page.getByRole("button", { name: "Remove feedback 1" }).click();
  expect((await notes(page))[0].id).toBe("legacy-note");
});

test("warns on leaving dirty dialogs and removes the warning after save or cancel", async ({
  page,
}) => {
  test.setTimeout(30_000);
  let warnings = 0;
  page.on("dialog", async (dialog) => {
    expect(dialog.type()).toBe("beforeunload");
    warnings += 1;
    await dialog.dismiss();
  });
  const openNew = async () => {
    await page
      .locator('.item-sheet.selected [data-section="item-1:goal"] .rich-text')
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
  };
  const openEdit = async () => {
    await page.getByRole("button", { name: "Feedback 1", exact: true }).click();
    await page
      .getByRole("button", { name: "Edit feedback 1", exact: true })
      .click();
  };
  await page.goto("/plans/browser-plan/items/item-1");
  await openNew();
  await page.reload();
  expect(warnings).toBe(0);
  await openNew();
  await page
    .getByRole("textbox", { name: "Your feedback", exact: true })
    .fill("A draft worth keeping");
  await page.evaluate(() => window.location.reload());
  expect(warnings).toBe(1);
  await expect(
    page.getByRole("textbox", { name: "Your feedback", exact: true }),
  ).toHaveValue("A draft worth keeping");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  expect(warnings).toBe(1);
  expect(await notes(page)).toEqual([]);
  await openNew();
  await saveComment(page, "A saved comment");
  await page.reload();
  await openEdit();
  await page.reload();
  expect(warnings).toBe(1);
  await openEdit();
  await page
    .getByRole("textbox", { name: "About", exact: true })
    .fill("Unsaved subject edit");
  await page.evaluate(() => window.location.reload());
  expect(warnings).toBe(2);
  await expect(
    page.getByRole("textbox", { name: "About", exact: true }),
  ).toHaveValue("Unsaved subject edit");
  await page.keyboard.press("Escape");
  await page.reload();
  expect(warnings).toBe(2);
  expect((await notes(page))[0].subject).toBe("Work item 1 · Goal");
});
