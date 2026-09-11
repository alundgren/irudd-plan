import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { IruddMcpClient } from "../../src/client/mcp-client.js";
import { tenItemPlan } from "../fixture.js";
import type { PlanService } from "../../src/domain/plan-service.js";
import type { PlanningPage } from "../../src/domain/conversation-sync.js";

type Packet = Awaited<ReturnType<PlanService["getItem"]>>;
for (const width of [1280, 390]) {
  test(`decision ownership and planning navigation at ${width}px`, async ({
    page,
    browser,
    baseURL,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const planId = `decisions-${randomUUID()}`;
    const client = new IruddMcpClient(new URL(`${baseURL}/mcp`), "token-a");
    const calls: string[] = [];
    async function call<T>(name: string, args: object) {
      calls.push(name);
      const result = await client.callTool<{
        isError?: boolean;
        structuredContent: T;
      }>(name, args);
      expect(result.isError, JSON.stringify(result)).not.toBe(true);
      return result.structuredContent;
    }
    const identity = { contractVersion: "v1", planId };
    const packet = () =>
      call<Packet>("get_work_item", { ...identity, itemId: "item-1" });
    await client.connect();
    try {
      const original = tenItemPlan(planId);
      const settled = {
        ...original.decisions[0]!,
        requiredContextIds: [],
        source: "PRIVATE PROVENANCE",
      };
      const implementer = {
        ...settled,
        id: "implementation",
        title: "Choose a cache limit",
        state: "implementer-decides",
        question: "How many entries should the cache retain?",
        body: "Choose a bounded cache size.",
        constraints:
          "Use a maximum of 100 entries. Keep the existing eviction order and ensure that repeated reads return the same stored result.",
      };
      const human = {
        ...settled,
        id: "human",
        title: "Retention",
        state: "human-needed",
        question: "Keep completed records?",
        body: "Choose whether completed records remain available.",
        questionId: "retention",
      };
      const items = original.items.slice(0, 2).map((item, index) => ({
        ...item,
        requiredContextIds: [],
        requiredAssetIds: [],
        requiredDecisionIds: index === 0 ? [settled.id, implementer.id] : [],
      }));
      await call("write_plan", {
        operationId: randomUUID(),
        expectedVersion: null,
        plan: {
          ...original,
          contexts: [],
          assets: [],
          decisions: [settled, implementer],
          items,
        },
      });
      const conversation = await call<PlanningPage>("get_planning", identity);
      await call("append_planning", {
        ...identity,
        operationId: randomUUID(),
        expectedRevision: 0,
        expectedDigest: conversation.cursor.digest,
        entries: [
          ...Array.from({ length: 26 }, (_, index) => ({
            id: `earlier-${index}`,
            kind: "note",
            section: "Earlier discussion",
            body: `Earlier planning note ${index}`,
          })),
          {
            id: "retention",
            kind: "question",
            section: "Retention",
            body: "Keep completed records?",
          },
          {
            id: "retention-other",
            kind: "question",
            section: "Retention",
            body: "Archive old records?",
          },
          {
            id: "retention-new",
            kind: "question",
            section: "Retention",
            body: "Archive after one year?",
          },
        ],
      });
      let selected = await packet();
      await call("patch_plan", {
        ...identity,
        operationId: randomUUID(),
        expectedVersion: selected.specificationCursor.revision,
        expectedDigest: selected.specificationCursor.digest,
        decisions: [human],
        items: [
          {
            ...selected.item,
            requiredDecisionIds: [
              ...selected.item.requiredDecisionIds,
              human.id,
            ],
          },
        ],
      });
      selected = await packet();
      expect(selected.decisionReadiness.canStart).toBe(false);
      let firstFetch = true;
      let pageHeld = false;
      let releasePage = () => {};
      const delayedPage = new Promise<void>((resolve) => {
        releasePage = resolve;
      });
      await page.route(`**/api/plans/${planId}/planning**`, async (route) => {
        const url = new URL(route.request().url());
        if (
          !url.pathname.endsWith("/planning") ||
          route.request().method() !== "GET"
        )
          return route.continue();
        if (firstFetch) {
          firstFetch = false;
          return route.fulfill({
            status: 503,
            json: { error: "Temporary failure" },
          });
        }
        if (url.searchParams.has("cursor") && !pageHeld) {
          pageHeld = true;
          await delayedPage;
        }
        return route.continue();
      });
      await page.goto(`/plans/${planId}/items/item-1`);
      const item = page.locator('.item-sheet[data-item-id="item-1"]');
      await expect(
        item.getByText(
          "Planning is reconnecting. Saved answers will appear when it reconnects.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect.poll(() => pageHeld).toBe(true);
      await expect(
        item.getByText("Planning question is unavailable.", { exact: true }),
      ).toHaveCount(0);
      releasePage();
      await expect(
        item.getByRole("heading", { name: "Still to decide", exact: true }),
      ).toBeVisible();
      await expect(
        item.getByRole("heading", { name: "Decided", exact: true }),
      ).toBeVisible();
      await expect(
        item.getByText("Human decision needed", { exact: true }),
      ).toBeVisible();
      await expect(
        item.getByText("Implementer decides", { exact: true }),
      ).toBeVisible();
      const empty = page.locator('.item-sheet[data-item-id="item-2"]');
      await expect(
        empty.getByRole("heading", { name: "Decisions", exact: true }),
      ).toHaveCount(0);
      await page.screenshot({
        path: `test-results/decisions-mixed-${width}.png`,
      });
      const answerAction = item.getByRole("button", {
        name: "Answer in planning",
      });
      await answerAction.click();
      const answer = page.getByRole("textbox", {
        name: "Answer: Keep completed records?",
        exact: true,
      });
      await expect(answer).toBeFocused();
      await answer.fill("Keep records");
      await page.getByRole("button", { name: "Back to work item" }).click();
      await answerAction.click();
      await expect(answer).toHaveValue("Keep records");
      await page
        .getByRole("button", {
          name: "Save answer: Keep completed records?",
          exact: true,
        })
        .click();
      await expect(answer).toHaveValue("");
      await page.getByRole("button", { name: "Back to work item" }).click();
      await expect(
        item
          .getByText("Answer saved; waiting for the plan to update", {
            exact: true,
          })
          .first(),
      ).toBeVisible();
      expect((await packet()).packetVersion).toBe(selected.packetVersion);
      expect((await packet()).decisionReadiness.canStart).toBe(false);
      const secondHuman = {
        ...human,
        id: "human-2",
        title: "Archiving",
        question: "Archive old records?",
        questionId: "retention-other",
      };
      await call("patch_plan", {
        ...identity,
        operationId: randomUUID(),
        expectedVersion: selected.specificationCursor.revision,
        expectedDigest: selected.specificationCursor.digest,
        decisions: [secondHuman],
        items: [
          {
            ...selected.item,
            requiredDecisionIds: [
              ...selected.item.requiredDecisionIds,
              secondHuman.id,
            ],
          },
        ],
      });
      selected = await packet();
      await expect(item.getByRole("status")).toHaveText(
        "Waiting for your decision",
      );
      await expect(
        item
          .locator('[data-decision-id="human"]')
          .getByText("Answer saved; waiting for the plan to update", {
            exact: true,
          }),
      ).toBeVisible();
      await expect(
        item
          .locator('[data-decision-id="human-2"]')
          .getByText("Waiting for your decision", { exact: true }),
      ).toBeVisible();
      const replacement = {
        ...secondHuman,
        question: "Archive after one year?",
        questionId: "retention-new",
        reason: "Narrow the archiving question",
      };
      await call("patch_plan", {
        ...identity,
        operationId: randomUUID(),
        expectedVersion: selected.specificationCursor.revision,
        expectedDigest: selected.specificationCursor.digest,
        decisions: [replacement],
      });
      selected = await packet();
      const secondAction = item
        .locator('[data-decision-id="human-2"]')
        .getByRole("button", { name: "Answer in planning" });
      await secondAction.focus();
      await page.keyboard.press("Enter");
      const secondAnswer = page.getByRole("textbox", {
        name: "Answer: Archive after one year?",
        exact: true,
      });
      await expect(secondAnswer).toBeFocused();
      await secondAnswer.fill("Archive after one year");
      await page
        .getByRole("button", {
          name: "Save answer: Archive after one year?",
          exact: true,
        })
        .click();
      await expect(secondAnswer).toHaveValue("");
      await page.getByRole("button", { name: "Back to work item" }).click();
      await expect(item.getByRole("status")).toHaveText(
        "Answer saved; waiting for the plan to update",
      );
      const { questionId: _secondQuestion, ...secondOutcome } = replacement;
      await call("verify_github_repository", identity);
      await call("publish_plan", identity);
      const anonymous = await browser.newContext({
        viewport: { width, height: 900 },
      });
      try {
        const publicPage = await anonymous.newPage();
        await publicPage.goto(
          `${baseURL}/public/plans/owner-a/${planId}/items/item-1`,
        );
        await expect(
          publicPage.getByText("Waiting for a human decision", { exact: true }),
        ).toBeVisible();
        await expect(
          publicPage.getByRole("button", { name: "Answer in planning" }),
        ).toHaveCount(0);
        await expect(
          publicPage.getByText("Answer saved; waiting for the plan to update", {
            exact: true,
          }),
        ).toHaveCount(0);
        const document = await anonymous.request.get(
          `${baseURL}/public/plans/owner-a/${planId}/document`,
        );
        const text = await document.text();
        expect(text).not.toContain("questionId");
        expect(text).not.toContain("PRIVATE PROVENANCE");
        expect(text).not.toContain("Keep records");
        await publicPage.screenshot({
          path: `test-results/decisions-public-${width}.png`,
        });
      } finally {
        await anonymous.close();
      }
      const { questionId: _questionId, ...outcome } = human;
      await call("patch_plan", {
        ...identity,
        operationId: randomUUID(),
        expectedVersion: selected.specificationCursor.revision,
        expectedDigest: selected.specificationCursor.digest,
        decisions: [
          {
            ...secondOutcome,
            state: "decided",
            body: "Archive after one year",
            reason: "Human chose one year",
          },
          {
            ...outcome,
            state: "decided",
            body: "Retain completed records",
            reason: "Human chose retention",
          },
        ],
        items: [
          { ...selected.item, requirements: ["Retain completed records"] },
        ],
      });
      await expect(
        item.getByText(
          "The implementer may start and must record the remaining outcomes before finishing.",
        ),
      ).toBeVisible();
      calls.length = 0;
      selected = await packet();
      const delegated = selected.decisions.find(
        (decision) => decision.id === "implementation",
      )!;
      const request = {
        ...identity,
        operationId: randomUUID(),
        expectedVersion: selected.specificationCursor.revision,
        expectedDigest: selected.specificationCursor.digest,
        decisions: [
          {
            ...delegated,
            state: "decided",
            body: "Retain 50 entries",
            reason: "Within the 100-entry limit",
          },
        ],
      };
      await call("patch_plan", request);
      await call("get_operation", {
        contractVersion: "v1",
        operationId: request.operationId,
      });
      selected = await packet();
      const checked = await call<{
        status: string;
        decisionReadiness: { canComplete: boolean };
      }>("check_packet", {
        ...identity,
        itemId: "item-1",
        packetVersion: selected.packetVersion,
      });
      expect(checked).toMatchObject({
        status: "unchanged",
        decisionReadiness: { canComplete: true },
      });
      expect(calls).toEqual([
        "get_work_item",
        "patch_plan",
        "get_operation",
        "get_work_item",
        "check_packet",
      ]);
      await expect(
        item.getByText("Retain 50 entries", { exact: true }),
      ).toBeVisible();
      await expect(
        item.getByRole("heading", { name: "Still to decide", exact: true }),
      ).toHaveCount(0);
      await page.screenshot({
        path: `test-results/decisions-decided-${width}.png`,
      });
      await call("patch_plan", {
        ...identity,
        operationId: randomUUID(),
        expectedVersion: selected.specificationCursor.revision,
        expectedDigest: selected.specificationCursor.digest,
        decisions: [{ ...implementer, reason: "Reconsider cache capacity" }],
      });
      await expect(
        item.getByText("Implementer decides", { exact: true }),
      ).toBeVisible();
      expect((await packet()).decisionReadiness.canComplete).toBe(false);
    } finally {
      await client.close();
    }
  });
}
