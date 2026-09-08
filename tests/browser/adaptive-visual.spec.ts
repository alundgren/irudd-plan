import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { PlanDocument } from "../../src/web/client-api.js";

test("compares revised C and the application with equivalent content", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const prototype = await context.newPage();
  await prototype.setViewportSize({ width: 1440, height: 1000 });
  const html = await readFile("docs/adaptive-sections/revised-c.html", "utf8");
  await prototype.route("**/revised-c", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await prototype.goto("http://127.0.0.1:4173/revised-c");
  const samples = (await prototype.evaluate("items")) as {
    title: string;
    goal: string;
    detail: string;
    checks: string[];
  }[];
  const image = await prototype
    .locator(".summary img")
    .first()
    .getAttribute("src");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/plans/browser-plan", async (route) => {
    const response = await route.fetch();
    const document = (await response.json()) as PlanDocument;
    const asset = {
      ...document.plan.assets[0]!,
      caption: "Shared decision guide for this item.",
      available: true,
    };
    await route.fulfill({
      json: {
        ...document,
        plan: {
          ...document.plan,
          epicGoal: "Remove prose-only test assertions",
          assets: [asset],
          items: samples.map((sample, index) => ({
            ...document.plan.items[0]!,
            id: `sample-${index}`,
            title: sample.title,
            shortGoal: sample.goal,
            goal: sample.detail,
            requirements: sample.checks,
            checks: [
              "Run the affected tests and review the retained behavioral evidence.",
            ],
            acceptanceCriteria: [],
            requiredContextIds: [],
            requiredDecisionIds: [],
            requiredAssetIds: [asset.id],
            relatedItemIds: [],
          })),
        },
      },
    });
  });
  await page.route("**/api/plans/browser-plan/assets/**", (route) =>
    route.fulfill({ json: { bytesBase64: image!.split(",")[1] } }),
  );
  await page.goto("/plans/browser-plan");
  await expect(page.locator(".asset-thumbnail")).toHaveCount(4);
  for (const [mode, label] of [
    ["overview", "Overview"],
    ["sections", "Sections"],
    ["reading", "Read"],
  ] as const) {
    await prototype.getByRole("button", { name: label, exact: true }).click();
    await prototype.screenshot({
      path: `docs/adaptive-sections/reference-${mode}.png`,
    });
    if (mode === "sections") {
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    }
    if (mode === "reading")
      await page.locator(".item-title-bar").first().click();
    await expect(page.locator(".plan-viewport")).toHaveAttribute(
      "data-mode",
      mode,
    );
    await page.screenshot({
      path: `docs/adaptive-sections/application-${mode}.png`,
    });
  }
  await prototype.close();
});
