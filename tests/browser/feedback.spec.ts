import { expect, test } from "@playwright/test";

import { IruddMcpClient } from "../../src/client/mcp-client.js";
import type { Plan } from "../../src/contract/plan.js";

test.describe.serial("local plan feedback", () => {
  test("retains precise feedback locally across revisions and owners", async ({
    context,
    page,
  }) => {
    const privateText = "SENTINEL feedback must stay browser local";
    const observedRequests: string[] = [];
    page.on("request", (request) => {
      observedRequests.push(`${request.url()}\n${request.postData() ?? ""}`);
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/plans/feedback-plan/items/item-1");
    await expect(page.getByText("Live · r1")).toBeVisible();
    const selected = page.locator(".plan-sheet.selected");

    const requirement = selected.getByText(
      "Keep the current committed requirements readable and selectable.",
    );
    await requirement.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await selected
      .getByRole("button", { name: "Add feedback to Requirements" })
      .click();
    await page
      .getByRole("textbox", { name: "Requested change for feedback 1" })
      .fill(privateText);
    await page.getByRole("button", { name: "Close feedback" }).click();

    await selected
      .getByRole("button", {
        name: "Add feedback to visual A small reference image",
      })
      .click();
    await page
      .getByRole("textbox", { name: "Requested change for feedback 2" })
      .fill("Replace this visual with the current signed-in flow.");
    await page.getByRole("button", { name: "Close feedback" }).click();

    await page.getByRole("button", { name: "Feedback 2", exact: true }).click();
    await page.getByRole("button", { name: "Pin a canvas area" }).click();
    await page.locator(".react-flow__pane").dispatchEvent("click", {
      clientX: 400,
      clientY: 650,
    });
    await page
      .getByRole("textbox", { name: "Requested change for feedback 3" })
      .fill("Use this open area for a note about rollout order.");
    const canvasPin = page.getByRole("button", {
      name: "Open canvas feedback 3",
    });
    await expect(canvasPin).toBeVisible();
    await expect(canvasPin).toHaveText("3");
    await expect(
      page.getByRole("button", { name: "Feedback 3", exact: true }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("button", { name: "Feedback 3", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Feedback 3", exact: true }).click();
    await expect(page.locator(".feedback-editor")).toHaveCount(3);
    await page.getByRole("button", { name: "Copy agent prompt (3)" }).click();
    await expect(
      page.getByRole("button", { name: "Prompt copied" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Requested change for feedback 1" })
      .fill(`${privateText}, with the subject named.`);
    await expect(
      page.getByRole("button", { name: "Copy agent prompt (3)" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Remove feedback 3" }).click();
    await page.getByRole("button", { name: "Copy agent prompt (2)" }).click();
    await expect(
      page.getByRole("button", { name: "Prompt copied" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Feedback 2", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close feedback" }).click();

    const currentResponse = await page.request.get("/api/plans/feedback-plan");
    const current = (await currentResponse.json()) as {
      readonly plan: Plan;
      readonly version: number;
    };
    const revised: Plan = {
      ...current.plan,
      items: current.plan.items.map((item) =>
        item.id === "item-1"
          ? {
              ...item,
              requirements: [
                ...item.requirements,
                "This revision changes the reviewed requirements section.",
              ],
              requiredAssetIds: item.requiredAssetIds.filter(
                (id) => id !== "asset-image",
              ),
            }
          : item,
      ),
    };
    const client = new IruddMcpClient(
      new URL("http://127.0.0.1:4173/mcp"),
      "token-a",
    );
    await client.connect();
    await client.callTool("write_plan", {
      operationId: "feedback-revision-two",
      expectedVersion: current.version,
      plan: revised,
    });
    await client.close();

    await expect(page.getByText("Live · r2")).toBeVisible({ timeout: 2_000 });
    await page.getByRole("button", { name: "Feedback 2", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Copy agent prompt (2)" }),
    ).toBeVisible();
    await expect(
      page.getByText("Target changed since revision 1"),
    ).toBeVisible();
    await expect(
      page.getByText("Target disappeared after revision 1"),
    ).toBeVisible();
    await page.getByLabel("It helped").check();
    await page.getByRole("button", { name: "Copy agent prompt (2)" }).click();
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    expect(prompt).toContain(privateText);
    expect(prompt).toContain("Observed internal revision: 1");
    expect(prompt).toContain("Current target status: changed");
    expect(prompt).toContain("Current target status: missing");
    expect(prompt).toContain("Original excerpt occurrence 1");
    expect(prompt).toMatch(/Original asset: asset-image at digest sha256:/);
    expect(prompt).toContain("check_packet");

    await page.reload();
    await page.getByRole("button", { name: "Feedback 2", exact: true }).click();
    await expect(page.getByLabel("It helped")).toBeChecked();
    await page.setExtraHTTPHeaders({ authorization: "Bearer browser-b" });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Feedback 0", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Feedback 0", exact: true }).click();
    await expect(page.locator(".feedback-editor")).toHaveCount(0);
    await page.setExtraHTTPHeaders({ authorization: "Bearer browser-a" });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Feedback 2", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("Live · r2")).toBeVisible();

    expect(
      observedRequests.some((request) => request.includes(privateText)),
    ).toBe(false);
  });

  test("shows manual recovery when storage and clipboard are unavailable", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { authorization: "Bearer browser-a" },
    });
    await context.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get: () => {
          throw new Error("storage blocked");
        },
      });
      Object.defineProperty(Navigator.prototype, "clipboard", {
        configurable: true,
        get: () => ({
          writeText: () => Promise.reject(new Error("clipboard blocked")),
        }),
      });
    });
    const page = await context.newPage();
    await page.goto("/plans/feedback-plan/items/item-1");
    await page
      .locator(".plan-sheet.selected")
      .getByRole("button", { name: "Add feedback to Goal" })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Local feedback storage is unavailable",
    );
    await page
      .getByRole("textbox", { name: "Requested change for feedback 1" })
      .fill("Clarify the recovery path.");
    await page.getByRole("button", { name: "Copy agent prompt (1)" }).click();
    const manual = page.getByRole("textbox", {
      name: "Agent prompt for manual copy",
    });
    await expect(manual).toBeVisible();
    await expect(manual).toHaveValue(/Clarify the recovery path/);
    await manual.focus();
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString().length))
      .toBeGreaterThan(100);
    await context.close();
  });
});
