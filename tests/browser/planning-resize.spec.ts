import { expect, test, type Locator } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { IruddMcpClient } from "../../src/client/mcp-client.js";
import type { PlanningPage } from "../../src/domain/conversation-sync.js";
import type { PlanningEntry } from "../../src/contract/planning.js";
import type { AssetDescriptor } from "../../src/contract/plan.js";

async function insideCanvas(element: Locator) {
  await expect
    .poll(async () =>
      element.evaluate((target) => {
        const view = document
          .querySelector(".planning-canvas")!
          .getBoundingClientRect();
        const box = target.getBoundingClientRect();
        return (
          box.left >= view.left &&
          box.right <= view.right &&
          box.top >= view.top &&
          box.bottom <= view.bottom
        );
      }),
    )
    .toBe(true);
}

test("mounted planning documents survive width and keyboard resizing", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(45_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  const planId = `resize-${randomUUID()}`;
  const client = new IruddMcpClient(new URL(`${baseURL}/mcp`), "token-a");
  await client.connect();
  const append = async (entries: PlanningEntry[]) => {
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
      entries,
    });
  };
  try {
    await client.callTool("write_plan", {
      operationId: randomUUID(),
      expectedVersion: null,
      plan: {
        contractVersion: "v1",
        planId,
        repository: { provider: "github", owner: "example", name: "project" },
        epicGoal: "Keep a question readable while resizing",
        items: [],
        contexts: [],
        decisions: [],
        assets: [],
      },
    });
    const assets: AssetDescriptor[] = [];
    for (const id of ["first", "second"]) {
      const visual = await client.callTool<{
        structuredContent: AssetDescriptor;
      }>("upload_asset", {
        contractVersion: "v1",
        planId,
        assetId: id,
        caption: `${id} example`,
        role: "illustration",
        mediaType: "image/svg+xml",
        bytesBase64: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 300"><rect width="440" height="300" fill="#EADFCD"/><text x="20" y="35" fill="#604939">Keep valid rows and report errors</text></svg>',
        ).toString("base64"),
      });
      assets.push(visual.structuredContent);
    }
    await append([
      {
        id: "earlier",
        section: "File formats",
        kind: "question",
        body: "Which formats should we accept?",
      },
      {
        id: "question",
        section: "Invalid rows",
        kind: "question",
        body: "What happens when two rows fail?",
        assets,
      },
      {
        id: "long-note",
        section: "Notes",
        kind: "note",
        body:
          "A long explanation.\n\n" +
          "Keep valid rows and report each error so the file can be corrected. ".repeat(
            70,
          ),
      },
    ]);
    await page.goto(`/plans/${planId}`);
    const question = page.locator('[data-planning-document="question"]');
    const answer = question.locator("textarea");
    const action = question.getByRole("button", { name: "Save answer:" });
    await page
      .getByLabel("Go to planning section")
      .selectOption("Invalid rows");
    await answer.fill("Keep the valid rows");
    await answer.focus();
    await page.screenshot({ path: "test-results/planning-resize-desktop.png" });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: "test-results/planning-resize-phone.png" });
    await insideCanvas(answer);
    await insideCanvas(action);
    await page.screenshot({ path: "test-results/planning-resize-phone.png" });
    await writeFile(
      "test-results/planning-resize-bounds.json",
      JSON.stringify(
        {
          phone: {
            editor: await answer.boundingBox(),
            action: await action.boundingBox(),
            panel: await question.boundingBox(),
            canvas: await page.locator(".planning-canvas").boundingBox(),
          },
        },
        null,
        2,
      ),
    );
    await expect(answer).toBeFocused();
    await expect(answer).toHaveValue("Keep the valid rows");
    await page.setViewportSize({ width: 1440, height: 900 });
    await insideCanvas(answer);
    await insideCanvas(action);
    await expect(answer).toBeFocused();

    const editorBeforeReply = await answer.boundingBox();
    await append([
      {
        id: "new-reply",
        section: "Invalid rows",
        kind: "note",
        replyTo: "question",
        body: "An additional example can clarify which rows to keep.",
      },
    ]);
    await expect(
      page.getByText("An additional example can clarify which rows to keep.", {
        exact: true,
      }),
    ).toBeAttached();
    await expect
      .poll(async () => (await answer.boundingBox())!.y)
      .toBeCloseTo(editorBeforeReply!.y, 0);
    await expect(answer).toBeFocused();

    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await question
        .getByRole("button", { name: "second example", exact: true })
        .click();
      const reference = page.locator(".planning-artifact").last();
      await page.setViewportSize({
        width: width === 390 ? 1440 : 390,
        height: 900,
      });
      await insideCanvas(
        reference.getByRole("button", { name: "Back to question" }),
      );
      await insideCanvas(reference.locator("iframe"));
      await reference.getByRole("button", { name: "Back to question" }).click();
      await insideCanvas(
        question.getByRole("button", { name: "Read question" }),
      );
    }
    await page
      .getByRole("button", { name: "Add a thought", exact: true })
      .click();
    const note = page.getByRole("textbox", {
      name: "Add a thought or ask a question",
    });
    await note.fill("Keep the report readable");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setViewportSize({ width: 390, height: 500 });
    await insideCanvas(note);
    await insideCanvas(page.getByRole("button", { name: "Save note:" }));
    await expect(note).toBeFocused();
    await expect(note).toHaveValue("Keep the report readable");
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, "height", {
        configurable: true,
        value: 320,
      });
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await insideCanvas(note);
    await insideCanvas(page.getByRole("button", { name: "Save note:" }));
    await expect(note).toBeFocused();
    await page.screenshot({
      path: "test-results/planning-resize-keyboard.png",
    });
    await page.evaluate(() => {
      delete (window.visualViewport as unknown as { height?: number }).height;
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(note).toBeFocused();
    const transform = await page
      .locator(".planning-world")
      .getAttribute("style");
    await append([
      {
        id: "unrelated",
        section: "File formats",
        kind: "note",
        body: "Another format can be discussed later.",
      },
    ]);
    await expect(
      page.getByText("Another format can be discussed later.", { exact: true }),
    ).toBeAttached();
    expect(await page.locator(".planning-world").getAttribute("style")).toBe(
      transform,
    );
    await note.press("End");
    await note.press("a");
    expect(await page.locator(".planning-world").getAttribute("style")).toBe(
      transform,
    );
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 900 });
    await insideCanvas(question);
    await page.getByLabel("Go to planning section").selectOption("Notes");
    const longNote = page.locator('[data-planning-document="long-note"]');
    await insideCanvas(longNote.getByRole("button", { name: "Read note" }));
    await page.locator(".planning-canvas").focus();
    await page.keyboard.press("ArrowDown");
    const before = await longNote.boundingBox();
    await page.setViewportSize({ width: 1440, height: 900 });
    const after = await longNote.boundingBox();
    expect(after!.y).toBeLessThan(before!.y + 50);
    await expect(answer).toHaveValue("Keep the valid rows");
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await answer.click();
    await answer.press("End");
    await answer.press("!");
    await page.setViewportSize({ width: 390, height: 500 });
    await insideCanvas(answer);
    await insideCanvas(action);
    expect((await answer.boundingBox())!.width).toBeGreaterThan(280);
    await expect(answer).toBeFocused();
    await expect(answer).toHaveValue("Keep the valid rows!");
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, "height", {
        configurable: true,
        value: 320,
      });
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await insideCanvas(answer);
    await insideCanvas(action);
    await expect(answer).toBeFocused();
    expect(errors).toEqual([]);
  } finally {
    await client.close();
  }
});
