import { expect, test } from "@playwright/test";

test("renders a selected published item without private browser credentials", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(
      "http://127.0.0.1:4173/public/plans/owner-a/browser-plan/items/item-1",
    );
    await expect(
      page.locator(".plan-sheet.selected").getByRole("heading", {
        name: "Work item 1",
      }),
    ).toBeVisible();
    await expect(page.getByText("Published", { exact: true })).toBeVisible();
    await expect(page.locator("figure.asset-view")).toHaveCount(3);
    await expect(
      page
        .frameLocator('iframe[title="Interactive review control"]')
        .getByText("Isolation active"),
    ).toBeVisible();
    const runtimeResponses = await page
      .locator("script[src], link[rel=stylesheet]")
      .evaluateAll((elements) =>
        elements.map((element) =>
          element instanceof HTMLScriptElement
            ? element.src
            : (element as HTMLLinkElement).href,
        ),
      );
    expect(runtimeResponses).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/public/assets/app.js"),
        expect.stringContaining("/public/assets/app.css"),
      ]),
    );
  } finally {
    await context.close();
  }
});
