import { expect, test, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { IruddMcpClient } from "../../src/client/mcp-client.js";
import type { PlanningPage } from "../../src/domain/conversation-sync.js";
import type { AssetDescriptor } from "../../src/contract/plan.js";
import type { PlanningEntry } from "../../src/contract/planning.js";

async function expectMotion(status: Locator) {
  const dots = status.locator(
    ".planning-inline-dot, .planning-inline-ellipsis span",
  );
  await expect(dots).toHaveCount(4);
  for (const dot of await dots.all()) {
    await expect(dot).toHaveCSS("animation-name", "planning-waiting-pulse");
    const before = await dot.evaluate(
      (element) => getComputedStyle(element).opacity,
    );
    await expect
      .poll(() => dot.evaluate((element) => getComputedStyle(element).opacity))
      .not.toBe(before);
  }
}

async function expectStatic(status: Locator) {
  for (const dot of await status
    .locator(".planning-inline-dot, .planning-inline-ellipsis span")
    .all()) {
    await expect(dot).toHaveCSS("animation-name", "none");
  }
}

for (const width of [1440, 390]) {
  test(`inline wait follows each answer and connection at ${width}px`, async ({
    page,
    baseURL,
    context,
  }) => {
    test.setTimeout(45_000);
    await page.setViewportSize({ width, height: 1000 });
    const planId = `inline-${randomUUID()}`;
    const client = new IruddMcpClient(new URL(`${baseURL}/mcp`), "token-a");
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    await client.connect();
    const conversation = async () =>
      (
        await client.callTool<{ structuredContent: PlanningPage }>(
          "get_planning",
          { contractVersion: "v1", planId },
        )
      ).structuredContent;
    const append = async (entries: PlanningEntry[]) => {
      const current = await conversation();
      await client.callTool("append_planning", {
        contractVersion: "v1",
        planId,
        operationId: randomUUID(),
        expectedRevision: current.headCursor.revision,
        expectedDigest: current.headCursor.digest,
        entries,
      });
    };
    const connectionId = randomUUID();
    const report = async (state: string, queuedThrough: number) => {
      const response = await fetch(
        `${baseURL}/companion/plans/${planId}/delivery`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer token-a",
            "content-type": "application/json",
          },
          body: JSON.stringify({ connectionId, state, queuedThrough }),
        },
      );
      expect(response.ok).toBe(true);
      await response.body?.cancel();
    };
    try {
      await client.callTool("write_plan", {
        operationId: randomUUID(),
        expectedVersion: null,
        plan: {
          contractVersion: "v1",
          planId,
          repository: { provider: "github", owner: "example", name: "project" },
          epicGoal: "Quiet inline activity",
          items: [],
          contexts: [],
          decisions: [],
          assets: [],
        },
      });
      await append([
        {
          id: "formats",
          kind: "question",
          section: "File formats",
          body: "Which formats should we accept?",
        },
        {
          id: "errors",
          kind: "question",
          section: "File formats",
          body: "How should invalid rows behave?",
        },
      ]);
      await page.goto(`/plans/${planId}`);
      await page
        .getByRole("button", { name: "Conversation canvas", exact: true })
        .click();
      const first = page.locator('[data-planning-document="formats"]');
      const second = page.locator('[data-planning-document="errors"]');
      const status = first.locator(".planning-inline-status");
      await expect(status).toHaveCount(0);
      await expect(first.locator("legend")).toHaveText("Your answer");
      await first.getByRole("textbox").fill("CSV");
      await expect(first.locator(".planning-saved-receipt")).toHaveCount(0);
      await second.getByRole("textbox").fill("Keep valid rows");
      await first.getByRole("button", { name: /^Save answer:/ }).focus();
      await page.keyboard.press("Enter");
      await expect(
        second.getByRole("button", { name: /^Save answer:/ }),
      ).toBeEnabled();
      await second.getByRole("button", { name: /^Save answer:/ }).focus();
      await page.keyboard.press("Enter");
      await expect(status).toContainText("Waiting for a reply");
      await expect(second.locator(".planning-inline-status")).toContainText(
        "Waiting for a reply",
      );
      await expect(
        first.locator(".planning-human .planning-saved-receipt"),
      ).toHaveText("✓ Saved to this plan");
      await expect(first.locator("legend")).toHaveText("Add a follow-up");
      await page
        .getByRole("combobox", { name: "Go to planning section" })
        .selectOption("File formats");
      await first.getByRole("button", { name: "Read question" }).click();
      await expectMotion(status);
      await first.getByRole("textbox").fill("Keep this draft");
      await expect(first.locator(".planning-saved-receipt")).toHaveCount(1);
      const response = await fetch(
        `${baseURL}/companion/plans/${planId}/events`,
        {
          signal: controller.signal,
          headers: {
            authorization: "Bearer token-a",
            "x-irudd-connection": connectionId,
            "x-irudd-thread": randomUUID(),
          },
        },
      );
      expect(response.ok).toBe(true);
      reader = response.body!.getReader();
      await reader.read();
      await expect(status).toContainText("The companion is connected");
      await expectMotion(status);
      // These answers predate companion connection. Its cursor cannot prove delivery.
      const queuedThrough = (await conversation()).headCursor.revision;
      await report("queued", queuedThrough);
      await expect(status).toContainText("The companion is connected");
      await expect(status).not.toContainText("Agent working");
      await expect(status).not.toContainText("Queued for the agent");
      await page
        .getByRole("combobox", { name: "Go to planning section" })
        .selectOption("File formats");
      await first.getByRole("button", { name: "Read question" }).click();
      await expect(status).toBeInViewport();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(status.locator(".planning-inline-dot")).toHaveCSS(
        "animation-name",
        "none",
      );
      await expectStatic(status);
      await expect(status.locator(".planning-inline-title")).toHaveCSS(
        "font-size",
        "17px",
      );
      await expect(status.locator(".planning-inline-title")).toHaveCSS(
        "font-weight",
        "600",
      );
      await expect(status.locator(".planning-inline-title")).toHaveCSS(
        "line-height",
        "27.2px",
      );
      await expect(status).toHaveCSS("color", "rgb(61, 96, 52)");
      await page
        .getByRole("toolbar", { name: "Planning canvas tools" })
        .getByTitle("Reset to 100%")
        .click();
      await expect(page.locator(".planning-canvas")).toHaveAttribute(
        "data-zoom",
        "1",
      );
      const measurements = await first.evaluate((thread) => {
        const style = (selector: string) =>
          getComputedStyle(thread.querySelector(selector)!);
        const title = style(".planning-inline-title");
        const receipt = style(".planning-saved-receipt");
        const human = style(".planning-human");
        const composer = style(".planning-answer-composer");
        return {
          fontFamily: title.fontFamily,
          titleSize: title.fontSize,
          titleWeight: title.fontWeight,
          titleLineHeight: title.lineHeight,
          titleColor: title.color,
          detailSize: style(".planning-inline-detail").fontSize,
          receiptSize: receipt.fontSize,
          receiptColor: receipt.color,
          receiptMarginTop: receipt.marginTop,
          answerIndent: human.paddingLeft,
          answerBorder: human.borderLeftWidth,
          statusMarginTop: style(".planning-inline-status").marginTop,
          composerBorder: composer.borderTopWidth,
          composerPadding: composer.paddingTop,
        };
      });
      await writeFile(
        `test-results/inline-measurements-${width}.json`,
        JSON.stringify(measurements, null, 2),
      );
      await page.screenshot({
        path: `test-results/inline-queued-${width}.png`,
      });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await context.setOffline(true);
      await expect(status).toContainText("Reconnecting to this plan");
      await expectStatic(status);
      await expect(first.getByRole("textbox")).toHaveValue("Keep this draft");
      await context.setOffline(false);
      await expect(status).toContainText("The companion is connected");
      await append([
        {
          id: "unrelated",
          kind: "resolved",
          section: "File formats",
          replyTo: "errors",
          body: "We will keep valid rows.",
        },
      ]);
      await expect(second.locator(".planning-inline-status")).toHaveCount(0);
      await expect(status).toContainText("The companion is connected");
      const visual = await client.callTool<{
        structuredContent: AssetDescriptor;
      }>("upload_asset", {
        contractVersion: "v1",
        planId,
        assetId: "reply-example",
        caption: "Reply example",
        role: "illustration",
        mediaType: "text/html",
        bytesBase64: Buffer.from(
          "<html><body><p>CSV example</p></body></html>",
        ).toString("base64"),
      });
      await append([
        {
          id: "resolved",
          kind: "resolved",
          section: "File formats",
          replyTo: "formats",
          body: "CSV it is.",
          assets: [visual.structuredContent],
        },
      ]);
      await expect(status).toHaveCount(0);
      await expect(first.locator(".planning-saved-receipt")).toHaveCount(1);
      await expect(
        page.locator(".planning-byline").filter({ hasText: "Resolved" }),
      ).toHaveCount(0);
      await expect(first.getByRole("textbox")).toHaveValue("Keep this draft");
      await expect(
        first.getByRole("button", { name: "Reply example", exact: true }),
      ).toHaveCount(1);
      await first.getByRole("textbox").fill("Also accept JSON");
      await page.route(`**/api/plans/${planId}/planning`, async (route) => {
        if (route.request().method() === "POST") await route.abort("failed");
        else await route.continue();
      });
      await first.getByRole("button", { name: /^Save follow-up:/ }).focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("button", { name: /^Retry saving:/ }),
      ).toBeVisible();
      await expect(first.locator(".planning-saved-receipt")).toHaveCount(1);
      await expect(status).toHaveCount(0);
      await expect(first.getByRole("textbox")).toHaveValue("Also accept JSON");
      await page.unroute(`**/api/plans/${planId}/planning`);
      await page.getByRole("button", { name: /^Retry saving:/ }).click();
      await expect(first.locator(".planning-saved-receipt")).toHaveCount(2);
      await expect(status).toContainText("The companion is connected");
      await expect(first.locator(".planning-byline")).not.toContainText([
        "Resolved",
      ]);
      await report("uncertain", queuedThrough);
      await expect(status).toContainText("Delivery needs checking");
      await expectStatic(status);
      await report("queued", (await conversation()).headCursor.revision);
      await expect(status).toContainText("The companion is connected");
      controller.abort();
      await reader.cancel().catch(() => {});
      await expect(status).toContainText("Companion disconnected");
      await expectStatic(status);
      await expect(first.locator(".planning-saved-receipt")).toHaveCount(2);
      await expect(status).toContainText("Your answer is saved");
      await page.screenshot({
        path: `test-results/inline-disconnected-${width}.png`,
      });
      await page.reload();
      await page
        .getByRole("button", { name: "Conversation canvas", exact: true })
        .click();
      await expect(status).toContainText("Companion disconnected");
      await expectStatic(status);
      await expect(first.locator(".planning-saved-receipt")).toHaveCount(2);
      await append([
        {
          id: "next",
          kind: "question",
          section: "File formats",
          replyTo: "formats",
          body: "Should JSON allow comments?",
        },
      ]);
      await expect(status).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    } finally {
      await context.setOffline(false);
      controller.abort();
      await reader?.cancel().catch(() => {});
      await client.close();
    }
  });
}
