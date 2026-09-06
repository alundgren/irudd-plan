import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { IruddMcpClient } from "../../src/client/mcp-client.js";
import { preflight, toolValue } from "../../src/client/preflight.js";
import { fixtureAssetUpload, tenItemPlan } from "../fixture.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the deployment smoke`);
  return value;
}

test("private/public review, local feedback, MCP revision and reconnect", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const remote = process.env.IRUDD_SMOKE_URL !== undefined;
  const ownerId = remote ? required("IRUDD_OWNER_ID") : "owner-a";
  let plan = tenItemPlan(`smoke-${randomUUID()}`);
  if (remote)
    plan = {
      ...plan,
      repository: {
        provider: "github",
        owner: required("IRUDD_REPO_OWNER"),
        name: required("IRUDD_REPO_NAME"),
      },
    };
  const credentials = remote
    ? {
        "CF-Access-Client-Id": required("CF_ACCESS_CLIENT_ID"),
        "CF-Access-Client-Secret": required("CF_ACCESS_CLIENT_SECRET"),
      }
    : "token-a";
  const client = new IruddMcpClient(new URL("/mcp", baseURL), credentials);
  const anonymous = await browser.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: {},
    storageState: { cookies: [], origins: [] },
  });
  try {
    await client.connect();
    await toolValue(client, "upload_asset", fixtureAssetUpload(plan.planId));
    await toolValue(client, "write_plan", {
      operationId: randomUUID(),
      expectedVersion: null,
      plan,
    });
    await client.close();
    const checkedClient = new IruddMcpClient(
      new URL("/mcp", baseURL),
      credentials,
    );
    try {
      await preflight(checkedClient, {
        ownerId,
        planId: plan.planId,
        itemId: "item-1",
      });
    } finally {
      await checkedClient.close();
    }
    const editor = new IruddMcpClient(new URL("/mcp", baseURL), credentials);
    try {
      await editor.connect();
      const privatePath = `/plans/${plan.planId}/items/item-1`;
      const publicRoot = `/public/plans/${encodeURIComponent(ownerId)}/${plan.planId}`;
      expect(
        (
          await anonymous.request.get(`${publicRoot}/document`, {
            maxRedirects: 0,
          })
        ).status(),
      ).toBe(404);
      expect(
        (
          await anonymous.request.get(`/api/plans/${plan.planId}`, {
            maxRedirects: 0,
          })
        ).status(),
      ).not.toBe(200);
      await page.goto(privatePath);
      await expect(page.getByText("Live · r1")).toBeVisible();
      await expect(
        page
          .locator(".plan-sheet.selected")
          .getByRole("heading", { name: "Work item 1" }),
      ).toBeVisible();
      await expect(page.locator("figure.asset-view")).toHaveCount(1);
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page
        .locator(".plan-sheet.selected")
        .getByRole("button", { name: "Add feedback to Requirements" })
        .click();
      await page
        .getByRole("textbox", { name: "Requested change for feedback 1" })
        .fill("Add a retry check to this requirement.");
      await page.getByRole("button", { name: "Copy agent prompt (1)" }).click();
      const feedback = await page.evaluate(() =>
        navigator.clipboard.readText(),
      );
      expect(feedback).toContain("Add a retry check");
      expect(feedback).toContain("check_packet");
      await page.getByRole("button", { name: "Close feedback" }).click();
      const revised = {
        ...plan,
        items: plan.items.map((item, index) =>
          index === 0
            ? {
                ...item,
                requirements: [
                  "Verify retry behavior after a connection failure.",
                ],
              }
            : item,
        ),
      };
      await toolValue(editor, "write_plan", {
        operationId: randomUUID(),
        expectedVersion: 1,
        plan: revised,
      });
      await expect(page.getByText("Live · r2")).toBeVisible();
      await expect(
        page.getByText(revised.items[0]!.requirements[0]!),
      ).toBeVisible();
      await context.setOffline(true);
      await expect(
        page.getByText("reconnecting", { exact: false }),
      ).toBeVisible();
      await context.setOffline(false);
      await expect(page.getByText("Live · r2")).toBeVisible();
      await toolValue(editor, "verify_github_repository", {
        contractVersion: "v1",
        planId: plan.planId,
      });
      await toolValue(editor, "publish_plan", {
        contractVersion: "v1",
        planId: plan.planId,
      });
      const publicPage = await anonymous.newPage();
      await publicPage.goto(`${publicRoot}/items/item-1`);
      await expect(publicPage.getByText("Live · r2")).toBeVisible();
      await expect(
        publicPage.getByText("Published", { exact: true }),
      ).toBeVisible();
      await expect(publicPage.locator("figure.asset-view")).toHaveCount(1);
      const asset = revised.assets[0]!;
      expect(
        (
          await anonymous.request.get(
            `${publicRoot}/assets/${asset.id}?digest=${encodeURIComponent(asset.digest)}`,
          )
        ).status(),
      ).toBe(200);
      const final = {
        ...revised,
        items: revised.items.map((item, index) =>
          index === 0
            ? {
                ...item,
                requirements: ["Verify retry and anonymous update delivery."],
              }
            : item,
        ),
      };
      await toolValue(editor, "write_plan", {
        operationId: randomUUID(),
        expectedVersion: 2,
        plan: final,
      });
      await expect(publicPage.getByText("Live · r3")).toBeVisible();
      console.log(
        `Smoke passed for ${plan.planId}; ${remote ? "deployed Cloudflare endpoint" : "local injected verifier only"}`,
      );
    } finally {
      await editor.close();
    }
  } finally {
    await client.close();
    await anonymous.close();
  }
});
