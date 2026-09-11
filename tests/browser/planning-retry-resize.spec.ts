import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { IruddMcpClient } from "../../src/client/mcp-client.js";
import type { PlanningPage } from "../../src/domain/conversation-sync.js";

for (const target of ["answer", "note"]) {
  test(`uncertain ${target} remains recoverable with the phone keyboard open`, async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const planId = `retry-resize-${randomUUID()}`;
    const client = new IruddMcpClient(new URL(`${baseURL}/mcp`), "token-a");
    await client.connect();
    try {
      await client.callTool("write_plan", {
        operationId: randomUUID(),
        expectedVersion: null,
        plan: {
          contractVersion: "v1",
          planId,
          repository: { provider: "github", owner: "example", name: "project" },
          epicGoal: "Recover a save with the keyboard open",
          items: [],
          contexts: [],
          decisions: [],
          assets: [],
        },
      });
      const current = (
        await client.callTool<{ structuredContent: PlanningPage }>(
          "get_planning",
          { contractVersion: "v1", planId },
        )
      ).structuredContent;
      await client.callTool("append_planning", {
        contractVersion: "v1",
        planId,
        operationId: randomUUID(),
        expectedRevision: current.headCursor.revision,
        expectedDigest: current.headCursor.digest,
        entries: [
          {
            id: "question",
            section: "Questions",
            kind: "question",
            body: "How should errors behave?",
          },
        ],
      });
      await page.goto(`/plans/${planId}`);
      await page
        .getByRole("button", { name: "Conversation canvas", exact: true })
        .click();
      const panel =
        target === "answer"
          ? page.locator('[data-planning-document="question"]')
          : page.locator(".planning-compose");
      const editor = panel.locator("textarea");
      await editor.fill("Keep valid rows");
      const requests: string[] = [];
      await page.route(`**/api/plans/${planId}/planning`, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        requests.push(route.request().postData()!);
        return requests.length === 1 ? route.abort("failed") : route.continue();
      });
      await panel.getByRole("button", { name: /^Save (answer|note):/ }).click();
      const retry = panel.getByRole("button", { name: /^Retry saving:/ });
      await expect(retry).toBeVisible();
      await editor.focus();
      await page.evaluate(() => {
        Object.defineProperty(window.visualViewport, "height", {
          configurable: true,
          value: 320,
        });
        window.visualViewport!.dispatchEvent(new Event("resize"));
      });
      await expect(editor).toBeFocused();
      const group = panel.locator(".planning-editor");
      await expect
        .poll(async () =>
          group.evaluate(
            (element) => element.scrollHeight > element.clientHeight,
          ),
        )
        .toBe(true);
      const before = await page
        .locator(".planning-world")
        .getAttribute("style");
      if (target === "answer") {
        await group.hover();
        await page.mouse.wheel(0, 300);
      } else {
        const bounds = (await group.boundingBox())!;
        const session = await page.context().newCDPSession(page);
        const x = bounds.x + bounds.width / 2;
        const y = bounds.y + bounds.height - 10;
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        for (const distance of [20, 40, 60, 80]) {
          await session.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x, y: y - distance }],
          });
        }
        await session.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await session.detach();
      }
      await expect
        .poll(async () => {
          const canvas = await page.locator(".planning-canvas").boundingBox();
          const button = await retry.boundingBox();
          return (
            button!.y >= canvas!.y &&
            button!.y + button!.height <= canvas!.y + canvas!.height
          );
        })
        .toBe(true);
      expect(await page.locator(".planning-world").getAttribute("style")).toBe(
        before,
      );
      await expect(editor).toHaveValue("Keep valid rows");
      await page.screenshot({
        path: `test-results/planning-retry-keyboard-${target}.png`,
      });
      await retry.click();
      await expect(
        panel.getByRole("status").filter({ hasText: "Saved to this plan." }),
      ).toBeVisible();
      expect(requests).toHaveLength(2);
      expect(requests[1]).toBe(requests[0]);
    } finally {
      await client.close();
    }
  });
}
