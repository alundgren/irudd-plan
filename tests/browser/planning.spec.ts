import type { PlanningPage } from "../../src/domain/conversation-sync.js";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { IruddMcpClient } from "../../src/client/mcp-client.js";
import type { AssetDescriptor } from "../../src/contract/plan.js";
import type { PlanningConversation } from "../../src/contract/planning.js";

for (const width of [1280, 390]) {
  test(`canvas questions and browser answers persist at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const planId = `planning-${randomUUID()}`;
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
          epicGoal: "Plan a file importer together",
          items: [],
          contexts: [],
          decisions: [],
          assets: [],
        },
      });
      const visual = await client.callTool<{
        structuredContent: AssetDescriptor;
      }>("upload_asset", {
        contractVersion: "v1",
        planId,
        assetId: "row-options",
        caption: "100 rows: 98 valid and 2 invalid",
        role: "illustration",
        mediaType: "image/svg+xml",
        bytesBase64: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 100"><rect width="440" height="100" fill="#EADFCD"/><text x="20" y="35" fill="#604939" font-family="sans-serif" font-size="20">100 rows</text><path d="M135 30h65" stroke="#604939"/><text x="220" y="35" fill="#3D6034" font-family="sans-serif" font-size="20">98 valid</text><text x="220" y="75" fill="#8F3A2D" font-family="sans-serif" font-size="20">2 invalid</text></svg>',
        ).toString("base64"),
      });
      await client.callTool("append_planning", {
        contractVersion: "v1",
        planId,
        operationId: randomUUID(),
        expectedRevision: 0,
        expectedDigest: (await readConversation(client, planId)).cursor.digest,
        entries: [
          {
            id: "formats",
            section: "File formats",
            kind: "question",
            body: "Which formats should we accept?",
            choices: ["CSV", "JSON"],
          },
          {
            id: "errors",
            section: "Invalid rows",
            kind: "question",
            body: "What happens when two rows fail?",
            assets: [visual.structuredContent],
          },
        ],
      });
      const postedCursor = (await readConversation(client, planId)).cursor;
      await page.goto(`/plans/${planId}`);
      await expect(
        page.getByRole("heading", { name: "File formats" }),
      ).toBeVisible();
      await expect(
        page.locator('iframe[title="100 rows: 98 valid and 2 invalid"]'),
      ).toBeAttached();
      await page.getByRole("button", { name: "CSV", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "CSV", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await page
        .getByRole("combobox", { name: "Go to planning section" })
        .selectOption("Invalid rows");
      await page
        .getByRole("textbox", {
          name: "Answer: What happens when two rows fail?",
        })
        .fill("Keep valid rows and report errors");
      await page
        .getByRole("button", { name: "View specification", exact: true })
        .click();
      await page.getByRole("button", { name: "Planning", exact: true }).click();
      await expect(
        page.getByRole("textbox", {
          name: "Answer: What happens when two rows fail?",
        }),
      ).toHaveValue("Keep valid rows and report errors");
      await page
        .getByRole("button", { name: "Save answers and notes" })
        .click();
      await expect(page.getByText("Saved to this plan.")).toBeVisible();
      const answer = await client.callTool<{
        structuredContent: PlanningConversation;
      }>("get_planning", {
        contractVersion: "v1",
        planId,
        cursor: postedCursor,
      });
      expect(
        answer.structuredContent.entries.map((entry) => entry.body),
      ).toEqual(["CSV", "Keep valid rows and report errors"]);
      expect(
        answer.structuredContent.entries.every(
          (entry) => entry.author === "human",
        ),
      ).toBe(true);
      await page.reload();
      await expect(
        page.getByText("Keep valid rows and report errors", { exact: true }),
      ).toBeVisible();
      const documents: AssetDescriptor[] = [];
      for (const [id, content] of [
        [
          "option-a",
          "# Reviewer\n\nReview the selected change.\nReport defects with file references.",
        ],
        [
          "option-b",
          "# Reviewer\n\nRead the shared review rules first.\nReview the selected change using those rules.",
        ],
      ]) {
        const result = await client.callTool<{
          structuredContent: AssetDescriptor;
        }>("upload_asset", {
          contractVersion: "v1",
          planId,
          assetId: id,
          caption: `${id}.md`,
          role: "illustration",
          mediaType: "text/html",
          bytesBase64: Buffer.from(
            `<html><head><style>body{margin:0;background:#f9f6f0;color:#604939;font:16px/1.6 system-ui}h2{font-size:22px;font-weight:600}pre{white-space:pre-wrap;font:15px/1.6 ui-monospace,monospace}</style></head><body><h2>${id}.md</h2><pre>${content}</pre></body></html>`,
          ).toString("base64"),
        });
        documents.push(result.structuredContent);
      }
      await page
        .getByRole("combobox", { name: "Go to planning section" })
        .selectOption("File formats");
      const cameraBefore = await page
        .locator(".planning-world")
        .getAttribute("style");
      await client.callTool("append_planning", {
        contractVersion: "v1",
        planId,
        operationId: randomUUID(),
        expectedRevision: 4,
        expectedDigest: (await readConversation(client, planId)).cursor.digest,
        entries: [
          {
            id: "comparison",
            section: "File formats",
            kind: "note",
            replyTo: "formats",
            body: "Compare the two proposed files beside this question.",
            assets: documents,
          },
        ],
      });
      await expect(page.locator(".planning-artifact")).toHaveCount(3);
      await expect(page.locator(".planning-world")).toHaveAttribute(
        "style",
        cameraBefore!,
      );
      await page.getByRole("button", { name: "Fit", exact: true }).click();
      const positions = await page
        .locator(".planning-comparison")
        .first()
        .locator("[data-planning-panel]")
        .evaluateAll((panels) =>
          panels.map((panel) => {
            const rect = panel.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top };
          }),
        );
      expect(positions).toHaveLength(3);
      expect(positions[1]!.left).toBeGreaterThan(positions[0]!.right);
      expect(positions[2]!.left).toBeGreaterThan(positions[1]!.right);
      expect(positions[2]!.top).toBeCloseTo(positions[1]!.top, 0);
      await page
        .getByRole("combobox", { name: "Go to planning section" })
        .selectOption("File formats");
      await page
        .getByRole("button", { name: "Compare examples", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Read option-a.md", exact: true }),
      ).toBeInViewport();
      await expect(
        page.getByRole("button", { name: "Read option-b.md", exact: true }),
      ).toBeInViewport();
      await page.screenshot({
        path: `test-results/planning-comparison-${width}.png`,
      });
      await page
        .getByRole("button", { name: "Read option-a.md", exact: true })
        .click();
      await expect(
        page.frameLocator('iframe[title="option-a.md"]').locator("pre"),
      ).toContainText("Report defects with file references.");
      await page
        .locator(".planning-artifact")
        .filter({
          has: page.getByRole("button", {
            name: "Read option-a.md",
            exact: true,
          }),
        })
        .getByRole("button", { name: "Back to question" })
        .click();
      await expect(
        page.getByRole("button", { name: "Compare examples", exact: true }),
      ).toBeInViewport();
      await page
        .getByRole("button", { name: "option-b.md", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Read option-b.md", exact: true }),
      ).toBeInViewport();
      const zoom = Number(
        await page.locator(".planning-canvas").getAttribute("data-zoom"),
      );
      await page.locator(".planning-canvas").focus();
      await page.keyboard.press("-");
      await expect
        .poll(async () =>
          Number(
            await page.locator(".planning-canvas").getAttribute("data-zoom"),
          ),
        )
        .toBeLessThan(zoom);
      const beforePan = await page
        .locator(".planning-world")
        .getAttribute("style");
      await page.keyboard.press("ArrowRight");
      await expect(page.locator(".planning-world")).not.toHaveAttribute(
        "style",
        beforePan!,
      );
      await client.callTool("append_planning", {
        contractVersion: "v1",
        planId,
        operationId: randomUUID(),
        expectedRevision: 5,
        expectedDigest: (await readConversation(client, planId)).cursor.digest,
        entries: [
          {
            id: "next",
            section: "File formats",
            kind: "question",
            body: "Should CSV accept tabs too?",
            replyTo: "formats",
          },
        ],
      });
      await expect(
        page.getByText("Should CSV accept tabs too?", { exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.getByRole("button", { name: "Fit", exact: true }).click();
      await page.screenshot({
        path: `test-results/planning-${width}.png`,
        fullPage: true,
      });
    } finally {
      await client.close();
    }
  });
}

test("an uncertain save retries the original batch without duplicating answers", async ({
  page,
  baseURL,
}) => {
  const planId = `planning-${randomUUID()}`;
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
        epicGoal: "Retry a saved answer",
        items: [],
        contexts: [],
        decisions: [],
        assets: [],
      },
    });
    await page.goto(`/plans/${planId}`);
    await page
      .getByRole("textbox", { name: "Add a thought or ask a question" })
      .fill("Keep this thought");
    let lost = false;
    await page.route(`**/api/plans/${planId}/planning`, async (route) => {
      if (route.request().method() === "POST" && !lost) {
        lost = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Save answers and notes" }).click();
    await expect(
      page.getByRole("button", { name: "Retry saving answers" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Add a thought or ask a question" }),
    ).toHaveValue("Keep this thought");
    await page.getByRole("button", { name: "Retry saving answers" }).click();
    await expect(page.getByText("Saved to this plan.")).toBeVisible();
    const result = await client.callTool<{
      structuredContent: PlanningConversation;
    }>("get_planning", { contractVersion: "v1", planId });
    expect(result.structuredContent.entries).toHaveLength(1);
  } finally {
    await client.close();
  }
});

async function readConversation(client: IruddMcpClient, planId: string) {
  const result = await client.callTool<{ structuredContent: PlanningPage }>(
    "get_planning",
    { contractVersion: "v1", planId },
  );
  return result.structuredContent;
}

test("polls only new entries and reloads bounded pages after a reset without losing the draft", async ({
  page,
  baseURL,
}) => {
  const planId = `sync-${randomUUID()}`;
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
        epicGoal: "Test bounded question delivery",
        items: [],
        contexts: [],
        decisions: [],
        assets: [],
      },
    });
    const empty = await readConversation(client, planId);
    await client.callTool("append_planning", {
      contractVersion: "v1",
      planId,
      operationId: randomUUID(),
      expectedRevision: 0,
      expectedDigest: empty.cursor.digest,
      entries: Array.from({ length: 30 }, (_, index) => ({
        id: `q${index}`,
        section: "Questions",
        kind: "question",
        body: `Choose option ${index}`,
      })),
    });
    const pages: PlanningPage[] = [];
    page.on("response", (response) => {
      if (
        response.url().includes(`/api/plans/${planId}/planning`) &&
        response.request().method() === "GET"
      )
        void response
          .json()
          .then((body) => pages.push(body as PlanningPage))
          .catch(() => undefined);
    });
    await page.goto(`/plans/${planId}`);
    await expect(
      page.getByText("Choose option 29", { exact: true }),
    ).toBeAttached();
    await expect
      .poll(() => pages.some((result) => result.status === "unchanged"))
      .toBe(true);
    expect(pages[0]!.entries).toHaveLength(25);
    expect(pages[1]!.entries).toHaveLength(5);
    expect(
      pages
        .filter((result) => result.status === "unchanged")
        .every((result) => result.entries.length === 0),
    ).toBe(true);
    const draft = page.getByRole("textbox", {
      name: "Add a thought or ask a question",
    });
    await draft.fill("Keep my unsent note");
    await page
      .getByRole("textbox", { name: "Answer: Choose option 0", exact: true })
      .fill("Keep my unsent answer");
    let reset = false;
    await page.route(`**/api/plans/${planId}/planning?**`, async (route) => {
      if (!reset) {
        reset = true;
        const response = await route.fetch();
        const body = (await response.json()) as PlanningPage;
        await route.fulfill({
          json: { ...body, status: "reset_required", entries: [] },
        });
      } else await route.continue();
    });
    await expect(page.getByRole("alert")).toContainText(
      "Conversation was reset",
    );
    await expect(draft).toHaveValue(/Keep my unsent note/);
    await expect(draft).toHaveValue(
      /Unsent answer to "Choose option 0":\nKeep my unsent answer/,
    );
    await expect(
      page.getByRole("button", { name: "Save answers and notes" }),
    ).toBeEnabled();
    expect(pages.filter((result) => result.entries.length === 25).length).toBe(
      2,
    );
    await expect(
      page.getByText("Choose option 29", { exact: true }),
    ).toHaveCount(1);
  } finally {
    await client.close();
  }
});
