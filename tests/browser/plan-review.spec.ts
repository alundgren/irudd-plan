import { expect, test } from "@playwright/test";
import { panTo } from "./canvas.js";

import { IruddMcpClient } from "../../src/client/mcp-client.js";
import type { AssetDescriptor } from "../../src/contract/plan.js";
import { browserAssetUploads, makeBrowserPlan } from "../browser-fixture.js";

test.describe.serial("plan review canvas", () => {
  test("opens direct items, follows committed writes, reconnects, and records captures", async ({
    context,
    page,
  }) => {
    await page.goto("/plans/browser-plan/items/item-1");
    const selected = page.locator(".plan-sheet.selected");
    await expect(
      selected.getByRole("heading", { name: "Work item 1" }),
    ).toBeVisible();
    await expect(page.getByText("Live · r1")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /edit|publish/i }),
    ).toHaveCount(0);

    const viewport = page.locator(".react-flow__viewport");
    await page.waitForTimeout(450);
    await panTo(page, selected.locator('[data-section="item-1:requirements"]'));
    const heightBefore = await selected.evaluate((sheet) => sheet.clientHeight);
    const viewportBefore = await viewport.getAttribute("style");
    await selected
      .getByText("Keep the current committed requirements")
      .evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString()))
      .toContain("current committed requirements");
    expect(await viewport.getAttribute("style")).toBe(viewportBefore);

    const client = new IruddMcpClient(
      new URL("http://127.0.0.1:4173/mcp"),
      "token-a",
    );
    await client.connect();
    const assets: AssetDescriptor[] = [];
    for (const upload of browserAssetUploads("browser-plan")) {
      const response = await client.callTool<{
        structuredContent: AssetDescriptor;
      }>("upload_asset", upload);
      assets.push(response.structuredContent);
    }
    const replacementResponse = await client.callTool<{
      structuredContent: AssetDescriptor;
    }>("upload_asset", {
      ...browserAssetUploads("browser-plan")[0],
      bytesBase64: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="80" height="40" fill="#178e89"/></svg>',
      ).toString("base64"),
    });
    const replacement = replacementResponse.structuredContent;
    const plan = makeBrowserPlan(assets);
    const revisionTwo = {
      ...plan,
      assets: plan.assets.map((asset) =>
        asset.id === replacement.id ? replacement : asset,
      ),
      items: plan.items.map((item, index) =>
        index === 0
          ? {
              ...item,
              requirements: [
                ...item.requirements,
                "This requirement arrived through a live MCP revision.",
                ...Array.from(
                  { length: 20 },
                  (_, index) =>
                    `Additional requirement ${index}: preserve the full document as its content grows across a live revision.`,
                ),
              ],
            }
          : item,
      ),
    };
    await client.callTool("write_plan", {
      operationId: "browser-revision-two",
      expectedVersion: 1,
      plan: revisionTwo,
    });
    await expect(page.getByText("Live · r2")).toBeVisible({ timeout: 2_000 });
    await expect(
      page.getByText("This requirement arrived through a live MCP revision."),
    ).toBeVisible();
    await expect(
      selected.locator('[data-section="item-1:requirements"]'),
    ).toHaveClass(/changed/);
    await expect(
      selected.locator('[data-section="item-1:visuals"]'),
    ).toHaveClass(/changed/);
    await expect(selected.locator("figure.asset-view")).toHaveCount(3);
    expect(
      await selected.evaluate((sheet) => sheet.clientHeight),
    ).toBeGreaterThan(heightBefore + 500);
    const nextSheet = await page
      .locator('.item-sheet[aria-label="Work item 2"]')
      .boundingBox();
    const currentSheet = await selected.boundingBox();
    expect(nextSheet!.x - currentSheet!.x - currentSheet!.width).toBe(72);
    expect(nextSheet!.y).toBe(currentSheet!.y);
    await expect(selected.locator("details")).toHaveCount(0);
    await expect(selected.getByText("Authentication rules")).toBeVisible();
    await expect(selected.getByText("Service boundary")).toBeVisible();
    expect(await viewport.getAttribute("style")).toBe(viewportBefore);

    await page.screenshot({
      path: "docs/captures/plan-canvas-desktop.png",
      fullPage: true,
    });
    await page
      .locator(".canvas-navigation")
      .getByRole("button", { name: "Overview" })
      .click();
    await expect(page).toHaveURL(/\/plans\/browser-plan$/);
    await expect(page.locator(".overview-sheet.selected")).toBeVisible();
    await page.goBack();
    await expect(page.locator(".item-sheet.selected")).toHaveAttribute(
      "aria-label",
      "Work item 1",
    );
    await page.goForward();
    await expect(page.locator(".overview-sheet.selected")).toBeVisible();

    await panTo(page, page.locator(".overview-index"));
    const overviewReadingPosition = await viewport.getAttribute("style");
    await context.setOffline(true);
    await expect(page.getByText("reconnecting")).toBeVisible();
    const revisionThree = {
      ...revisionTwo,
      epicGoal: "The latest revision after a missed update",
    };
    await client.callTool("write_plan", {
      operationId: "browser-revision-three",
      expectedVersion: 2,
      plan: revisionThree,
    });
    const revisionFour = {
      ...revisionThree,
      epicGoal: "The current revision after two missed updates",
    };
    await client.callTool("write_plan", {
      operationId: "browser-revision-four",
      expectedVersion: 3,
      plan: revisionFour,
    });
    await context.setOffline(false);
    await expect(page.getByText("Live · r4")).toBeVisible();
    expect(await viewport.getAttribute("style")).toBe(overviewReadingPosition);
    await expect(
      page
        .locator(".overview-sheet")
        .getByRole("heading", { name: revisionFour.epicGoal }),
    ).toBeVisible();
    await expect(page.locator(".react-flow__node-sheet")).toHaveCount(11);
    await expect(page.locator(".react-flow__edge")).toHaveCount(10);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/plans/browser-plan/items/item-1");
    await expect(page.locator(".plan-sheet.selected")).toBeVisible();
    await page.screenshot({
      path: "docs/captures/plan-canvas-narrow.png",
      fullPage: true,
    });
    await page.goto("/plans/browser-plan/items/item-10");
    const withoutItemTen = {
      ...revisionFour,
      items: revisionFour.items.filter((item) => item.id !== "item-10"),
    };
    await client.callTool("write_plan", {
      operationId: "browser-delete-item",
      expectedVersion: 4,
      plan: withoutItemTen,
    });
    await expect(page.getByText("This work item was deleted")).toBeVisible({
      timeout: 2_000,
    });
    await client.close();
  });

  test("keeps interactive HTML away from parent credentials and navigation", async ({
    page,
  }) => {
    let unexpectedPlanListRequests = 0;
    let forbiddenNavigationRequests = 0;
    let forbiddenModuleRequests = 0;
    let workerCsp = "";
    const stableAssetCacheHeaders: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/plans") {
        unexpectedPlanListRequests += 1;
      }
      if (pathname === "/escaped" || pathname === "/frame-escaped") {
        forbiddenNavigationRequests += 1;
      }
      if (new URL(request.url()).hostname === "tracker.example") {
        forbiddenModuleRequests += 1;
      }
    });
    page.on("response", (response) => {
      const pathname = new URL(response.url()).pathname;
      if (pathname.includes("/assets/mockup-worker-")) {
        workerCsp = response.headers()["content-security-policy"] ?? "";
      }
      if (pathname === "/assets/app.js" || pathname === "/assets/app.css") {
        stableAssetCacheHeaders.push(response.headers()["cache-control"] ?? "");
      }
    });
    await page.goto("/plans/browser-plan/items/item-1");
    const mockup = page.frameLocator(
      'iframe[title="Interactive review control"]',
    );
    await expect(mockup.getByText("Isolation active")).toBeVisible();
    await expect
      .poll(() =>
        mockup.locator("body").evaluate((body) => ({
          storage: body.dataset.storage,
          network: body.dataset.network,
          indexedDb: body.dataset.indexedDb,
          storageApi: body.dataset.storageApi,
          broadcast: body.dataset.broadcast,
          timerStorage: body.dataset.timerStorage,
          timerNetwork: body.dataset.timerNetwork,
        })),
      )
      .toEqual({
        storage: "blocked",
        network: "blocked",
        indexedDb: "blocked",
        storageApi: "blocked",
        broadcast: "blocked",
        timerStorage: "blocked",
        timerNetwork: "blocked",
      });
    await panTo(
      page,
      page.locator('iframe[title="Interactive review control"]'),
    );
    const viewport = await page
      .locator(".react-flow__viewport")
      .getAttribute("style");
    await mockup.getByRole("button", { name: "Fail one interaction" }).click();
    await mockup.getByRole("button", { name: "Reviewed 0 times" }).click();
    await expect(
      mockup.getByRole("button", { name: "Reviewed 1 time" }),
    ).toBeVisible();
    expect(
      await page.locator(".react-flow__viewport").getAttribute("style"),
    ).toBe(viewport);
    await expect(page).toHaveURL(/\/plans\/browser-plan\/items\/item-1$/);
    expect(unexpectedPlanListRequests).toBe(0);
    expect(forbiddenNavigationRequests).toBe(0);
    expect(forbiddenModuleRequests).toBe(0);
    expect(workerCsp).toContain("connect-src 'none'");
    expect(stableAssetCacheHeaders).toHaveLength(2);
    expect(stableAssetCacheHeaders).toEqual([
      "no-cache, must-revalidate",
      "no-cache, must-revalidate",
    ]);

    const currentResponse = await page.request.get("/api/plans/browser-plan");
    const current = (await currentResponse.json()) as {
      plan: { assets: AssetDescriptor[] };
    };
    const hostile = current.plan.assets.find(
      (asset) => asset.id === "asset-mockup",
    );
    expect(hostile).toBeDefined();
    await page.evaluate(() => localStorage.setItem("private", "still-private"));
    const directResponse = await page.goto(
      `/api/plans/browser-plan/assets/asset-mockup?digest=${encodeURIComponent(hostile?.digest ?? "")}`,
    );
    expect(directResponse?.headers()["content-type"]).toContain(
      "application/json",
    );
    expect(directResponse?.headers()["x-content-type-options"]).toBe("nosniff");
    await page.waitForTimeout(150);
    await expect(page).toHaveURL(/\/assets\/asset-mockup/);
    expect(await page.evaluate(() => localStorage.getItem("private"))).toBe(
      "still-private",
    );
  });

  test("keeps the newest revision and reports failed synchronization", async ({
    page,
  }) => {
    await page.goto("/plans/browser-plan/items/item-1");
    await expect(page.getByText("Live · r5")).toBeVisible();
    const staleResponse = await page.request.get("/api/plans/browser-plan");
    const staleDocument = await staleResponse.json();
    const client = new IruddMcpClient(
      new URL("http://127.0.0.1:4173/mcp"),
      "token-a",
    );
    await client.connect();
    const currentPlan = (staleDocument as { plan: Record<string, unknown> })
      .plan;
    let intercepted = 0;
    await page.route("**/api/plans/browser-plan", async (route) => {
      intercepted += 1;
      if (intercepted === 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route
          .fulfill({
            status: 200,
            contentType: "application/json",
            json: staleDocument,
          })
          .catch(() => undefined);
        return;
      }
      await route.continue();
    });
    const revisionSix = { ...currentPlan, epicGoal: "Delayed revision six" };
    await client.callTool("write_plan", {
      operationId: "browser-revision-six",
      expectedVersion: 5,
      plan: revisionSix,
    });
    await expect.poll(() => intercepted).toBe(1);
    const revisionSeven = {
      ...revisionSix,
      epicGoal: "Current revision seven",
    };
    await client.callTool("write_plan", {
      operationId: "browser-revision-seven",
      expectedVersion: 6,
      plan: revisionSeven,
    });
    await expect(page.getByText("Live · r7")).toBeVisible();
    await expect(
      page
        .locator(".overview-sheet")
        .getByRole("heading", { name: "Current revision seven" }),
    ).toBeVisible();
    await page.waitForTimeout(600);
    await expect(page.getByText("Live · r7")).toBeVisible();

    await page.unroute("**/api/plans/browser-plan");
    await page.route("**/api/plans/browser-plan", (route) =>
      route.fulfill({ status: 503, body: "temporarily unavailable" }),
    );
    const revisionEight = { ...revisionSeven, epicGoal: "Revision eight" };
    await client.callTool("write_plan", {
      operationId: "browser-revision-eight",
      expectedVersion: 7,
      plan: revisionEight,
    });
    await expect(page.getByText("reconnecting")).toBeVisible();
    await expect(page.getByText("Live · r8")).toHaveCount(0);
    await expect(
      page
        .locator(".overview-sheet")
        .getByRole("heading", { name: "Current revision seven" }),
    ).toBeVisible();
    await client.close();
  });

  test("shows loading, empty, and unavailable states", async ({ page }) => {
    await page.route("**/api/plans/browser-plan", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.continue();
    });
    const opening = page.goto("/plans/browser-plan");
    await expect(page.getByText("Loading current plan")).toBeVisible();
    await opening;
    await expect(page.locator(".overview-sheet.selected")).toBeVisible();
    await page.unroute("**/api/plans/browser-plan");

    await page.route("**/api/plans", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"plans":[]}',
      }),
    );
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "No plans yet" }),
    ).toBeVisible();
    await page.unroute("**/api/plans");

    await page.route("**/api/plans", (route) =>
      route.fulfill({ status: 503, body: "temporarily unavailable" }),
    );
    await page.goto("/");
    await expect(page.locator(".state-card.error")).toBeVisible();
    await expect(page.getByText("Loading current plan")).toHaveCount(0);
    await page.unroute("**/api/plans");

    await page.goto("/plans/expired-or-missing");
    await expect(
      page.getByRole("heading", { name: "Plan unavailable" }),
    ).toBeVisible();
    await page.goto("/plans/%");
    await expect(
      page.getByRole("heading", { name: "Plan unavailable" }),
    ).toBeVisible();
  });
});
