import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { IruddMcpClient } from "../../src/client/mcp-client.js";
import type { PlanningPage } from "../../src/domain/conversation-sync.js";

for (const width of [1440, 390]) {
  test(`long planning content keeps save and sources usable at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const planId = `context-${randomUUID()}`;
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
          epicGoal: "Choose importer behavior",
          items: [],
          contexts: [],
          decisions: [],
          assets: [],
        },
      });
      const read = async (tool: string, cursor?: PlanningPage["cursor"]) =>
        (
          await client.callTool<{ structuredContent: PlanningPage }>(tool, {
            contractVersion: "v1",
            planId,
            ...(cursor ? { cursor } : {}),
          })
        ).structuredContent;
      const context = await read("get_agent_context");
      const evidence =
        "src/import/read.ts at 7a01f466e63a51cead7dfe53a244c13e60c4ac99: preserve tab input; investigation pending; handoff tracking.\n\n".repeat(
          150,
        );
      await client.callTool("append_agent_context", {
        contractVersion: "v1",
        planId,
        operationId: randomUUID(),
        expectedRevision: 0,
        expectedDigest: context.cursor.digest,
        entries: [
          { id: "evidence", title: "Repository investigation", body: evidence },
        ],
      });
      const empty = await read("get_planning");
      await client.callTool("append_planning", {
        contractVersion: "v1",
        planId,
        operationId: randomUUID(),
        expectedRevision: 0,
        expectedDigest: empty.cursor.digest,
        entries: [
          {
            id: "question",
            section: "Import behavior",
            kind: "question",
            body: "Should valid rows still be imported?",
            source: { entryId: "evidence", label: "Current importer" },
          },
          ...Array.from({ length: 12 }, (_, index) => ({
            id: `note-${index}`,
            section: "Import behavior",
            kind: "note",
            body:
              `Example ${index}: ` +
              "A file contains valid rows and rows with invalid dates. The report lets you find each error and try again. ".repeat(
                15,
              ),
          })),
        ],
      });
      const posted = await read("get_planning");
      const sourceRequests: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("/agent-context/"))
          sourceRequests.push(request.url());
      });
      await page.goto(`/plans/${planId}`);
      const answer = page.getByRole("textbox", {
        name: "Answer: Should valid rows still be imported?",
      });
      await expect(answer).toBeVisible();
      await expect(
        page.getByText("Server connected · receiving conversation updates"),
      ).toBeVisible();
      expect(sourceRequests).toHaveLength(0);
      await expect(
        page.getByText("Repository investigation", { exact: true }),
      ).toHaveCount(0);
      await answer.fill("Import the valid rows");
      let action = page.getByRole("button", {
        name: "Save answer: Should valid rows still be imported?",
      });
      const assertReachable = async () => {
        await action.focus();
        const box = await action.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(
          page.viewportSize()!.height,
        );
      };
      await assertReachable();
      await page.getByText("Source: Current importer", { exact: true }).click();
      await expect(
        page.getByText("Repository investigation", { exact: true }),
      ).toBeVisible();
      expect(sourceRequests).toHaveLength(1);
      expect(
        await page
          .locator(".planning-source-content")
          .evaluate((element) => element.scrollHeight > element.clientHeight),
      ).toBe(true);
      await page.getByText("Source: Current importer", { exact: true }).click();
      await page
        .getByRole("button", { name: "Add a thought", exact: true })
        .click();
      action = page.getByRole("button", {
        name: "Save note: Add a thought or ask a question",
      });
      await page
        .getByRole("textbox", { name: "Add a thought or ask a question" })
        .fill("Keep the report readable");
      // Focus navigation keeps the local action reachable with a reduced viewport.
      await page.setViewportSize({ width, height: 500 });
      await assertReachable();
      let lost = false;
      await page.route(`**/api/plans/${planId}/planning`, async (route) => {
        if (route.request().method() === "POST" && !lost) {
          lost = true;
          await route.fetch();
          await route.abort("failed");
        } else await route.continue();
      });
      await action.click();
      const retry = page.getByRole("button", {
        name: "Retry saving: Add a thought or ask a question",
      });
      await expect(retry).toBeVisible();
      await expect(page.getByRole("alert")).toBeVisible();
      await retry.focus();
      await retry.click();
      await expect(
        page.getByText("Saved to this plan.", { exact: true }),
      ).toBeVisible();
      await expect(answer).toHaveValue("Import the valid rows");
      action = page.getByRole("button", {
        name: "Save answer: Should valid rows still be imported?",
      });
      await assertReachable();
      await action.click();
      await expect(answer).toHaveValue("");
      const submitted = await read("get_planning", posted.cursor);
      expect(submitted.entries.map((entry) => entry.body)).toEqual([
        "Keep the report readable",
        "Import the valid rows",
      ]);
      expect(submitted.entries[1]).toMatchObject({
        author: "human",
        replyTo: "question",
      });
      expect((await read("get_planning", submitted.cursor)).entries).toEqual(
        [],
      );
      // A resumed active consumer responds to the original question, using an idempotent write.
      const resolution = {
        contractVersion: "v1",
        planId,
        operationId: randomUUID(),
        expectedRevision: submitted.cursor.revision,
        expectedDigest: submitted.cursor.digest,
        entries: [
          {
            id: "resolution",
            section: "Import behavior",
            kind: "resolved",
            replyTo: "question",
            body: "We will import valid rows and report the errors.",
          },
        ],
      };
      await client.callTool("append_planning", resolution);
      await client.callTool("append_planning", resolution);
      const handled = await read("get_planning", submitted.cursor);
      expect(handled.entries).toHaveLength(1);
      expect((await read("get_planning", handled.cursor)).entries).toHaveLength(
        0,
      );
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await expect(
        page.getByText("Import the valid rows", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(resolution.entries[0]!.body, { exact: true }),
      ).toBeVisible();

      await page.screenshot({
        path: `test-results/agent-context-${width}.png`,
        fullPage: true,
      });
    } finally {
      await client.close();
    }
  });
}
