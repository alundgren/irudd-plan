import { expect, test, type Page } from "@playwright/test";
import {
  caption,
  originalDigest,
  replacementDigest,
  referenceFixture,
} from "./reference-fixture.js";
import { openReference, panTo } from "./canvas.js";

async function expectNoOverlap(page: Page) {
  const sheets = await page
    .locator(".plan-sheet")
    .evaluateAll((elements) =>
      elements.map((el) => el.getBoundingClientRect().toJSON()),
    );
  for (let i = 0; i < sheets.length; i++)
    for (let j = i + 1; j < sheets.length; j++) {
      const a = sheets[i]!,
        b = sheets[j]!;
      expect(
        a.right <= b.left ||
          b.right <= a.left ||
          a.bottom <= b.top ||
          b.bottom <= a.top,
      ).toBe(true);
    }
}

for (const width of [1440, 390]) {
  test(`reads mixed reference sheets and returns to their item at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await referenceFixture(page);
    await page.goto("/plans/browser-plan/items/item-1");
    await openReference(page, caption);
    const sheet = page.locator(".reference-sheet.selected");
    await expect(
      sheet.getByRole("heading", { name: "Reference for Work item 1" }),
    ).toBeInViewport();
    await expect(
      sheet.getByText("Acceptance reference", { exact: true }),
    ).toBeVisible();
    await expect(
      sheet.getByText("binding-reference", { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `docs/captures/reference-sheet-${width}.png`,
    });
    if (width === 1440) {
      await page
        .getByRole("button", { name: "Feedback 0", exact: true })
        .click();
      await page.screenshot({
        path: "docs/captures/reference-sheet-feedback.png",
      });
      await page.getByRole("button", { name: "Close feedback" }).click();
    }
    const frame = sheet.locator("iframe");
    await expect(frame).toHaveAttribute("sandbox", "");
    const dimensions = await frame.boundingBox();
    expect(dimensions!.height / dimensions!.width).toBeCloseTo(2, 2);
    const nativeWidth = await sheet.evaluate(
      (element) =>
        element.getBoundingClientRect().width /
        (element as HTMLElement).offsetWidth,
    );
    expect(nativeWidth).toBeCloseTo(
      Number(await page.locator(".plan-viewport").getAttribute("data-zoom")),
      2,
    );
    await panTo(
      page,
      sheet.getByRole("button", { name: /Add feedback to visual/ }),
    );
    await sheet.getByRole("button", { name: /Add feedback to visual/ }).focus();
    await expect(
      sheet.getByRole("button", { name: /Add feedback to visual/ }),
    ).toBeFocused();
    await expectNoOverlap(page);
    await panTo(
      page,
      sheet.getByRole("button", { name: "Return to Work item 1" }),
    );
    await sheet.getByRole("button", { name: "Return to Work item 1" }).click();
    await expect(page.locator(".item-sheet.selected h2")).toHaveText(
      "Work item 1",
    );
    await openReference(page, "Wide overview");
    const wide = await sheet.locator("iframe").boundingBox();
    expect(wide!.width / wide!.height).toBeCloseTo(4, 2);
    await sheet.getByRole("button", { name: "Return to Work item 1" }).click();
    await openReference(page, "Raster reference");
    await expect
      .poll(() =>
        sheet
          .locator("img")
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    const raster = await sheet.locator("img").boundingBox();
    expect(raster!.width / raster!.height).toBeCloseTo(1, 2);
    await sheet.getByRole("button", { name: "Return to Work item 1" }).click();
    await openReference(page, "Interactive document");
    await page.getByRole("button", { name: "Pan", exact: true }).click();
    const html = sheet.frameLocator("iframe");
    await expect
      .poll(() =>
        sheet.locator("iframe").evaluate((element) => element.clientHeight),
      )
      .toBeGreaterThan(850);
    await expect(html.locator("body")).toHaveCSS("font-family", "system-ui");
    await panTo(page, sheet.locator("iframe"));
    const htmlBounds = await sheet.locator("iframe").boundingBox();
    await page.mouse.move(htmlBounds!.x + 40, htmlBounds!.y + 40);
    const beforeWheel = await page
      .locator(".plan-viewport")
      .evaluate((el) =>
        String(
          new DOMMatrix(
            getComputedStyle(el.querySelector(".plan-layout")!).transform,
          ).f,
        ),
      );
    await page.mouse.wheel(0, 1300);
    await expect
      .poll(() =>
        page
          .locator(".plan-viewport")
          .evaluate((el) =>
            String(
              new DOMMatrix(
                getComputedStyle(el.querySelector(".plan-layout")!).transform,
              ).f,
            ),
          ),
      )
      .not.toBe(beforeWheel);
    await panTo(page, html.getByRole("button", { name: "Show detail" }));
    await html.getByRole("button", { name: "Show detail" }).click();
    await expect(html.getByText("The detail is now visible.")).toBeVisible();
    await expectNoOverlap(page);
    await panTo(
      page,
      sheet.getByRole("button", { name: "Return to Work item 1" }),
    );
    await sheet.getByRole("button", { name: "Return to Work item 1" }).click();
    for (const [name, message] of [
      ["Missing drawing", "Asset unavailable or rejected"],
      ["Unsupported drawing", "Preview unavailable for application/pdf"],
      ["Failed image request", "Asset unavailable or rejected"],
    ]) {
      await openReference(page, name!);
      await expect(sheet.getByRole("status")).toHaveText(message!);
      await sheet
        .getByRole("button", { name: "Return to Work item 1" })
        .click();
    }
    await page
      .locator(".canvas-navigation")
      .getByRole("button", { name: "Overview" })
      .click();
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await expect(page.locator(".plan-layout")).toHaveClass(/show-summaries/);
    await expect(page.locator(".item-summary").first()).toContainText(
      "visual references",
    );
  });
}

test("shared visual feedback retains each item and original digest across replacement and removal", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const fixture = await referenceFixture(page);
  await page.goto("/plans/browser-plan/items/item-1");
  for (const item of [1, 2]) {
    if (item === 2) {
      await page
        .locator(".canvas-navigation")
        .getByRole("button", { name: "Overview" })
        .click();
      const row = page
        .locator(".overview-index")
        .getByRole("button", { name: "Work item 2", exact: true });
      await panTo(page, row);
      await row.click();
    }
    await openReference(page, caption);
    const sheet = page.locator(".reference-sheet.selected");
    await expect(sheet).toHaveAttribute("data-item-id", `item-${item}`);
    const add = sheet.getByRole("button", { name: /Add feedback to visual/ });
    await panTo(page, add);
    await add.focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("textbox", { name: "Your feedback", exact: true })
      .fill(`Review guide for item ${item}.`);
    await page
      .getByRole("button", { name: "Add comment", exact: true })
      .click();
    await page.getByRole("button", { name: "Close feedback" }).click();
  }
  await page.getByRole("button", { name: "Feedback 2", exact: true }).click();
  for (const item of [1, 2]) {
    await page
      .getByRole("button", {
        name: `${item}. Work item ${item} · Decision guide`,
        exact: true,
      })
      .click();
    const reference = page.locator(".reference-sheet.selected");
    await expect(reference).toHaveAttribute("data-item-id", `item-${item}`);
    await expect(reference).toHaveAttribute("data-asset-id", "guide");
    await expect
      .poll(
        async () =>
          (await page
            .getByRole("button", { name: `Open asset feedback ${item}` })
            .boundingBox())!.y +
          (await page
            .getByRole("button", { name: `Open asset feedback ${item}` })
            .boundingBox())!.height /
            2 -
          (await page.locator(".plan-viewport").boundingBox())!.y,
      )
      .toBeCloseTo(24, 0);
  }
  await page.getByRole("button", { name: "Close feedback" }).click();
  await expect
    .poll(
      async () =>
        (await page.locator(".reference-sheet.selected").boundingBox())!.x,
    )
    .toBeGreaterThan(300);
  const viewport = await page
    .locator(".plan-viewport")
    .evaluate((el) =>
      String(
        new DOMMatrix(
          getComputedStyle(el.querySelector(".plan-layout")!).transform,
        ).f,
      ),
    );
  await fixture.update();
  const changedSheet = page.locator(".reference-sheet.selected");
  await expect(changedSheet.locator("[data-section]")).toHaveClass("changed");
  const captionBounds = await changedSheet.locator("figcaption").boundingBox();
  const drawingBounds = await changedSheet.locator("iframe").boundingBox();
  expect(captionBounds!.height).toBeGreaterThan(500);
  expect(drawingBounds!.y).toBeGreaterThan(
    captionBounds!.y + captionBounds!.height,
  );
  await expectNoOverlap(page);
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
  ).toBe(viewport);
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(
    page.locator(
      '.reference-sheet[data-item-id="item-1"][data-asset-id="wide"] [data-section]',
    ),
  ).not.toHaveClass("changed");
  await page.getByTitle("Reset to 100%", { exact: true }).click();
  await page.getByRole("button", { name: "Feedback 2", exact: true }).click();
  await expect(
    page.getByText(
      "This location has changed since you commented. The copied feedback keeps your original reference.",
    ),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Copy feedback (2)" }).click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  for (const item of [1, 2])
    expect(prompt).toContain(`work item item-${item}, asset guide`);
  expect(prompt.match(new RegExp(originalDigest, "g"))).toHaveLength(2);
  expect(prompt).not.toContain(replacementDigest);
  await fixture.update(true);
  await expect(
    page.getByText(
      "This location is no longer in the plan. The copied feedback keeps your original reference.",
    ),
  ).toHaveCount(1);
  await expect(
    page.getByText(
      "This location has changed since you commented. The copied feedback keeps your original reference.",
    ),
  ).toHaveCount(1);
  await expect(
    page.locator(
      '.reference-sheet[data-item-id="item-1"][data-asset-id="guide"]',
    ),
  ).toHaveCount(0);
  await expect(page.locator(".reference-sheet.selected")).toHaveAttribute(
    "data-item-id",
    "item-2",
  );
  await expectNoOverlap(page);
});

test("bounds viewport-relative HTML and keeps overflow scrollable inside its isolated document", async ({
  page,
}) => {
  await referenceFixture(page);
  await page.route("**/api/plans/browser-plan/assets/html?*", (route) =>
    route.fulfill({
      json: {
        bytesBase64: Buffer.from(
          '<html><body><main style="height:100vh">Viewport-relative document</main><p>Document bottom</p></body></html>',
        ).toString("base64"),
      },
    }),
  );
  await page.goto("/plans/browser-plan/items/item-1");
  await openReference(page, "Interactive document");
  const sheet = page.locator(".reference-sheet.selected");
  const frame = sheet.locator("iframe");
  await expect
    .poll(() => frame.evaluate((element) => element.clientHeight), {
      timeout: 10000,
    })
    .toBe(4096);
  await page.getByRole("button", { name: "Pan", exact: true }).click();
  const html = sheet.frameLocator("iframe");
  await expect
    .poll(() =>
      html
        .locator("html")
        .evaluate((element) => element.scrollHeight > element.clientHeight),
    )
    .toBe(true);
  await panTo(page, frame);
  const bounds = await frame.boundingBox();
  await page.mouse.move(bounds!.x + 40, bounds!.y + 40);
  const viewport = await page
    .locator(".plan-viewport")
    .evaluate((el) =>
      String(
        new DOMMatrix(
          getComputedStyle(el.querySelector(".plan-layout")!).transform,
        ).f,
      ),
    );
  await page.mouse.wheel(0, 200);
  await expect
    .poll(() => html.locator("html").evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
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
  ).toBe(viewport);
});

test("returns to the item when its selected reference association disappears", async ({
  page,
}) => {
  const fixture = await referenceFixture(page);
  await page.goto("/plans/browser-plan/items/item-1");
  await openReference(page, caption);
  await fixture.update(true);
  await expect(page.locator(".item-sheet.selected h2")).toHaveText(
    "Work item 1",
  );
  await expect(
    page.locator(
      '.reference-sheet[data-item-id="item-1"][data-asset-id="guide"]',
    ),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/items\/item-1$/);
});

test("return from a reference preserves the previous browser-history destination", async ({
  page,
}) => {
  await referenceFixture(page);
  await page.goto("/plans/browser-plan");
  const itemLink = page
    .locator(".overview-index")
    .getByRole("button", { name: "Work item 1", exact: true });
  await panTo(page, itemLink);
  await itemLink.click();
  await openReference(page, caption);
  await page
    .locator(".reference-sheet.selected")
    .getByRole("button", { name: "Return to Work item 1" })
    .click();
  await expect(page.locator(".item-sheet.selected")).toBeInViewport();
  await page.goBack();
  await expect(page).toHaveURL(/\/plans\/browser-plan$/);
  await expect(page.locator(".overview-sheet.selected")).toBeVisible();
});
