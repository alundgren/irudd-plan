import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { IruddMcpClient } from "../../src/client/mcp-client.js";
import type { PlanningPage } from "../../src/domain/conversation-sync.js";

for (const width of [1440, 390]) {
  test(`independent saves preserve edits and recover at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    const planId = `save-${randomUUID()}`;
    const client = new IruddMcpClient(new URL(`${baseURL}/mcp`), "token-a");
    await client.connect();
    const read = async () =>
      (
        await client.callTool<{ structuredContent: PlanningPage }>(
          "get_planning",
          { contractVersion: "v1", planId },
        )
      ).structuredContent;
    try {
      await client.callTool("write_plan", {
        operationId: randomUUID(),
        expectedVersion: null,
        plan: {
          contractVersion: "v1",
          planId,
          repository: { provider: "github", owner: "example", name: "project" },
          epicGoal: "Save one answer at a time",
          items: [],
          contexts: [],
          decisions: [],
          assets: [],
        },
      });
      const initial = await read();
      await client.callTool("append_planning", {
        contractVersion: "v1",
        planId,
        operationId: randomUUID(),
        expectedRevision: initial.cursor.revision,
        expectedDigest: initial.cursor.digest,
        entries: [
          {
            id: "a",
            section: "Questions",
            kind: "question",
            body: "Which file formats should the importer accept when a customer uploads exports from several systems?",
          },
          {
            id: "b",
            section: "Questions",
            kind: "question",
            body: "How should invalid rows be handled?",
          },
        ],
      });
      await page.goto(`/plans/${planId}`);
      const a = page.locator('[data-planning-document="a"]');
      const b = page.locator('[data-planning-document="b"]');
      const note = page.getByRole("textbox", {
        name: "Add a thought or ask a question",
      });
      const noteSave = page.getByRole("button", { name: /^Save note:/ });
      await expect(
        a.getByRole("button", { name: /^Save answer:/ }),
      ).toBeDisabled();
      await a.getByRole("textbox").fill("  CSV  ");
      await b.getByRole("textbox").fill("Keep B draft");
      await note.fill("Keep note draft\n".repeat(20));
      const posts: string[] = [];
      let release!: () => void;
      const delayed = new Promise<void>((resolve) => {
        release = resolve;
      });
      let first = true;
      await page.route(`**/api/plans/${planId}/planning`, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        posts.push(route.request().postData()!);
        if (first) {
          first = false;
          await route.fetch();
          await delayed;
          await route.abort("failed");
        } else await route.continue();
      });
      const saveA = a.getByRole("button", { name: /^Save answer:/ });
      await saveA.focus();
      await page.keyboard.press("Enter");
      await expect(a.getByRole("button", { name: /^Saving/ })).toBeDisabled();
      await expect(
        b.getByRole("button", { name: /^Save answer:/ }),
      ).toBeDisabled();
      await expect(b).toContainText("Another save is in progress");
      await a.getByRole("textbox").fill("Newer A draft");
      await b.getByRole("textbox").fill("Newer B draft");
      await note.fill("Newer note draft\n".repeat(20));
      release();
      const retry = a.getByRole("button", { name: /^Retry saving:/ });
      await expect(retry).toBeEnabled();
      await retry.focus();
      await expect(a.getByRole("alert")).toContainText(
        "Retry to check the original submission",
      );
      const errorBox = await a.getByRole("alert").boundingBox();
      expect(errorBox!.y).toBeGreaterThanOrEqual(0);
      expect(errorBox!.y + errorBox!.height).toBeLessThanOrEqual(900);
      const box = await retry.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(900);
      await page.screenshot({
        path: `test-results/per-question-error-${width}.png`,
      });
      await retry.click();
      await expect(
        a.getByRole("status").filter({ hasText: "Saved to this plan." }),
      ).toBeVisible();
      expect(posts[1]).toBe(posts[0]);
      expect(JSON.parse(posts[0]!).entries).toHaveLength(1);
      expect(
        (await read()).entries
          .filter((entry) => entry.author === "human")
          .map((entry) => entry.body),
      ).toEqual(["CSV"]);
      await expect(a.getByRole("textbox")).toHaveValue("Newer A draft");
      await expect(b.getByRole("textbox")).toHaveValue("Newer B draft");
      await expect(note).toHaveValue("Newer note draft\n".repeat(20));
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));
      await expect(noteSave).toBeDisabled();
      await expect(
        b.getByRole("button", { name: /^Save answer:/ }),
      ).toBeDisabled();
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect(noteSave).toBeEnabled();
      // Simulate a known revision rejection with an actual new agent message.
      let conflict = true;
      await page.unroute(`**/api/plans/${planId}/planning`);
      await page.route(`**/api/plans/${planId}/planning`, async (route) => {
        if (route.request().method() === "POST" && conflict) {
          conflict = false;
          const current = await read();
          await client.callTool("append_planning", {
            contractVersion: "v1",
            planId,
            operationId: randomUUID(),
            expectedRevision: current.cursor.revision,
            expectedDigest: current.cursor.digest,
            entries: [
              {
                id: "agent-reply",
                section: "Questions",
                kind: "note",
                replyTo: "a",
                body: "Consider JSON as well.",
              },
            ],
          });
          await route.fulfill({
            status: 409,
            json: { error: "PLAN_CONFLICT" },
          });
        } else await route.continue();
      });
      const saveB = b.getByRole("button", { name: /^Save answer:/ });
      await saveB.focus();
      await page.keyboard.press("Enter");
      await expect(b.getByRole("alert")).toContainText(
        "Review the latest entries",
      );
      await expect(a.getByText("Consider JSON as well.")).toBeAttached();
      await expect(b.getByRole("textbox")).toHaveValue("Newer B draft");
      await expect(a.getByRole("textbox")).toHaveValue("Newer A draft");
      await saveB.click();
      await expect(b.getByRole("textbox")).toHaveValue("");
      await note.focus();
      await note.evaluate((element) => {
        element.style.height = "420px";
      });
      await page.keyboard.press("Tab");
      await expect(noteSave).toBeFocused();
      const noteBox = await noteSave.boundingBox();
      expect(noteBox!.x).toBeGreaterThanOrEqual(0);
      expect(noteBox!.x + noteBox!.width).toBeLessThanOrEqual(width);
      expect(noteBox!.y + noteBox!.height).toBeLessThanOrEqual(900);
      await page.screenshot({
        path: `test-results/per-question-note-${width}.png`,
      });
      await noteSave.click();
      await expect(note).toHaveValue("");
      await expect(a.getByRole("textbox")).toHaveValue("Newer A draft");
      const saved = (await read()).entries.filter(
        (entry) => entry.author === "human",
      );
      expect(saved.map((entry) => entry.kind)).toEqual([
        "answer",
        "answer",
        "note",
      ]);
      // A reset can remove the origin while the accepted request is still uncertain.
      await expect(
        a.getByRole("button", { name: /^Save follow-up:/ }),
      ).toBeEnabled();
      await note.fill("Keep this recovery note");
      await page.unroute(`**/api/plans/${planId}/planning`);
      const recoveryPosts: string[] = [];
      await page.route(`**/api/plans/${planId}/planning`, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        recoveryPosts.push(route.request().postData()!);
        if (recoveryPosts.length === 1) {
          await route.fetch();
          await route.abort("failed");
        } else await route.continue();
      });
      await a.getByRole("button", { name: /^Save follow-up:/ }).focus();
      await page.keyboard.press("Enter");
      await expect(
        a.getByRole("button", { name: /^Retry saving:/ }),
      ).toBeEnabled();
      let resetPage = true;
      await page.route(`**/api/plans/${planId}/planning**`, async (route) => {
        if (route.request().method() !== "GET") return route.fallback();
        if (resetPage) {
          resetPage = false;
          await route.fulfill({
            json: { ...initial, status: "reset_required" },
          });
        } else await route.fulfill({ json: initial });
      });
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect(a).toHaveCount(0);
      await expect(note).toHaveValue(/Keep this recovery note/);
      await expect(note).toHaveValue(/Newer A draft/);
      const recoveredNote = await note.inputValue();
      const recoveredRetry = page.getByRole("button", {
        name: "Retry saving: Add a thought or ask a question",
      });
      await recoveredRetry.focus();
      await expect(page.locator(".planning-compose")).toContainText(
        "This save belongs to a question that is no longer shown",
      );
      await recoveredRetry.click();
      await expect(
        page.getByText("The original answer was saved to this plan.", {
          exact: true,
        }),
      ).toBeVisible();
      expect(recoveryPosts).toHaveLength(2);
      expect(recoveryPosts[1]).toBe(recoveryPosts[0]);
      await expect(note).toHaveValue(recoveredNote);
      expect(
        (await read()).entries.filter(
          (entry) => entry.author === "human" && entry.body === "Newer A draft",
        ),
      ).toHaveLength(1);
      console.log(JSON.stringify({ width, retry: box, noteSave: noteBox }));
    } finally {
      await client.close();
    }
  });
}
