import { expect, test } from "@playwright/test";
import { guidedFixture } from "./guided-fixture.js";
import { captureProofStill, recordProof } from "./ui-proof.js";

test.setTimeout(60000);

for (const width of [1280, 390]) {
  test(`guided answers and history at ${width}px`, async ({
    page,
    baseURL,
  }, info) => {
    await page.setViewportSize({ width, height: 800 });
    const fixture = await guidedFixture(page, baseURL!);
    const { view, client, append } = fixture;
    try {
      await expect(
        view.getByRole("heading", {
          name: "Should an open human decision stop the whole work item?",
        }),
      ).toBeVisible();
      await captureProofStill(page, `guided-overview-${width}`);
      const exercise = async () => {
        await view
          .getByRole("button", { name: "Wait for the whole item", exact: true })
          .click();
        await view
          .getByRole("textbox", { name: /^Answer:/ })
          .pressSequentially(
            ". Other ready items can still proceed independently.",
            { delay: 35 },
          );
        await view.getByRole("button", { name: /^Save answer:/ }).click();
        await expect(
          view.getByRole("heading", { name: "Who records the decision?" }),
        ).toBeVisible();
        await view
          .getByRole("button", { name: "Waiting 1", exact: true })
          .click();
        await view
          .getByRole("button", { name: "Close list", exact: true })
          .click();
        await expect(view.locator(".planning-inline-title")).toBeVisible();
        await expect(
          view.getByRole("textbox", { name: /^Answer:/ }),
        ).toHaveCount(0);
        await view.getByRole("button", { name: "Done 1", exact: true }).click();
        await view
          .getByRole("button", { name: "Close list", exact: true })
          .click();
        await expect(
          view
            .getByText("Keep the original file for later review.", {
              exact: true,
            })
            .first(),
        ).toBeVisible();
        await view.getByRole("button", { name: "Reopen for revision" }).click();
        await expect(
          view.getByRole("textbox", { name: /^Answer:/ }),
        ).toBeVisible();
        await view
          .getByRole("textbox", { name: /^Answer:/ })
          .pressSequentially(
            "Keep the original file until the review is complete.",
            { delay: 35 },
          );
      };
      if (width === 1280)
        await recordProof(page, info, "guided-answer-and-reopen", exercise);
      else await exercise();
      await append([
        {
          id: "ack",
          section: "Work item readiness",
          kind: "note",
          replyTo: "readiness",
          body: "Answer received.",
        },
      ]);
      await expect(
        view.getByRole("button", { name: "Waiting 1", exact: true }),
      ).toBeVisible();
      await append([
        {
          id: "followup",
          section: "Work item readiness",
          kind: "question",
          replyTo: "readiness",
          body: "Should a failed check also stop the item?",
        },
      ]);
      await expect(
        view.getByRole("button", { name: "Open questions 4", exact: true }),
      ).toBeVisible();
      await expect(view.getByRole("textbox", { name: /^Answer:/ })).toHaveValue(
        "Keep the original file until the review is complete.",
      );
      await page.reload();
      await expect(
        view.getByRole("button", { name: "Done 0", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    } finally {
      await client.close();
    }
  });
}

test("example reading controls preserve drafts and isolate document sizes", async ({
  page,
  baseURL,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { view, client, append } = await guidedFixture(page, baseURL!);
  try {
    const answer = view.getByRole("textbox", { name: /^Answer:/ });
    await answer.fill(
      "Keep the whole item waiting; other ready items can proceed.",
    );
    await recordProof(page, info, "compare-examples-and-return", async () => {
      await view.getByRole("button", { name: "Compare examples" }).click();
      const dialog = page.getByRole("dialog");
      const first = dialog.getByRole("article", {
        name: "whole-item.json",
        exact: true,
      });
      const second = dialog.getByRole("article", {
        name: "independent-work.json",
        exact: true,
      });
      await expect(first.locator("iframe")).toBeVisible();
      await expect(second.locator("iframe")).toBeVisible();
      const width = await second.evaluate(
        (element) => element.getBoundingClientRect().width,
      );
      await first.getByLabel("Reading size").selectOption("1.5");
      await first.getByRole("button", { name: "Wider", exact: true }).click();
      await expect(first).toHaveClass(/example-wide/);
      expect(
        await second.evaluate(
          (element) => element.getBoundingClientRect().width,
        ),
      ).toBe(width);
      await expect(second.getByLabel("Reading size")).toHaveValue("1");
      await dialog.getByLabel("Canvas zoom").selectOption("0.75");
      await first.getByLabel("Reading size").selectOption("1.25");
      await captureProofStill(page, "example-workspace");
      await dialog.getByRole("button", { name: "Back to question" }).click();
      await expect(answer).toHaveValue(
        "Keep the whole item waiting; other ready items can proceed.",
      );
      await view
        .getByRole("button", { name: "Leave open and continue" })
        .click();
      await expect(
        view.getByRole("heading", { name: "Who records the decision?" }),
      ).toBeVisible();
      await view
        .getByRole("button", { name: /Work item readiness Should an open/ })
        .click();
      await expect(answer).toHaveValue(
        "Keep the whole item waiting; other ready items can proceed.",
      );
    });
    await view.getByRole("button", { name: "Compare examples" }).click();
    await append([
      {
        id: "new-example-note",
        section: "Work item readiness",
        kind: "note",
        replyTo: "readiness",
        body: "Check the full discussion after comparing.",
      },
    ]);
    await page.keyboard.press("Escape");
    await expect(answer).toHaveValue(
      "Keep the whole item waiting; other ready items can proceed.",
    );
    await view.getByText("Earlier discussion · 1", { exact: true }).click();
    await expect(
      view.getByText("Check the full discussion after comparing."),
    ).toBeVisible();
  } finally {
    await client.close();
  }
});

test("uncertain answers stay editable until the original receipt is confirmed", async ({
  page,
  baseURL,
}) => {
  const { view, planId, client, read } = await guidedFixture(page, baseURL!);
  try {
    const answer = view.getByRole("textbox", { name: /^Answer:/ });
    await answer.fill("Wait for the whole item.");
    let lost = false;
    await page.route(`**/api/plans/${planId}/planning`, async (route) => {
      if (route.request().method() === "POST" && !lost) {
        lost = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await view.getByRole("button", { name: /^Save answer:/ }).click();
    await expect(
      view.getByRole("button", { name: /^Retry saving:/ }),
    ).toBeVisible();
    await expect(answer).toHaveValue("Wait for the whole item.");
    await answer.fill("Wait for the whole item, including checks.");
    await view.getByRole("button", { name: /^Retry saving:/ }).click();
    await expect(
      view.getByText("Saved to this plan.", { exact: true }),
    ).toBeVisible();
    await expect(answer).toHaveValue(
      "Wait for the whole item, including checks.",
    );
    expect(
      (await read()).entries.filter((entry) => entry.kind === "answer"),
    ).toHaveLength(1);
  } finally {
    await client.close();
  }
});

test("phone comparison keeps each file readable and restores keyboard focus", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { view, client } = await guidedFixture(page, baseURL!);
  try {
    const compare = view.getByRole("button", { name: "Compare examples" });
    await compare.click();
    const documents = page.locator(".example-document");
    await expect(documents).toHaveCount(2);
    const first = await documents.nth(0).boundingBox();
    const second = await documents.nth(1).boundingBox();
    expect(second!.y).toBeGreaterThan(first!.y + first!.height);
    expect(first!.width).toBeGreaterThan(340);
    await page.keyboard.press("Escape");
    await expect(compare).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await client.close();
  }
});

test("resolutions leave the working area and completed history stays compact", async ({
  page,
  baseURL,
}) => {
  const { view, client, append } = await guidedFixture(page, baseURL!);
  try {
    await append(
      Array.from({ length: 20 }, (_, index) => [
        {
          id: `old-${index}`,
          section: "Older questions",
          kind: "question" as const,
          body: `Historical question ${index}`,
        },
        {
          id: `done-${index}`,
          section: "Older questions",
          kind: "resolved" as const,
          replyTo: `old-${index}`,
          body: `Historical resolution ${index}`,
        },
      ]).flat(),
    );
    await expect(
      view.getByRole("button", { name: "Done 21", exact: true }),
    ).toBeVisible();
    await expect(view.locator(".guided-question")).toHaveCount(1);
    await expect(
      view.getByText("Historical question 0", { exact: true }),
    ).toHaveCount(0);
    await view.getByRole("button", { name: "Compare examples" }).click();
    await append([
      {
        id: "settled",
        section: "Work item readiness",
        kind: "resolved",
        replyTo: "readiness",
        body: "Wait for the whole item.",
      },
    ]);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Back to question" }).click();
    await expect(
      view.getByRole("heading", { name: "Who records the decision?" }),
    ).toBeVisible();
    await append([
      {
        id: "owner-settled",
        section: "Decision ownership",
        kind: "resolved",
        replyTo: "owner",
        body: "The planner records it.",
      },
      {
        id: "completion-settled",
        section: "Completion",
        kind: "resolved",
        replyTo: "completion",
        body: "Complete when all checks pass.",
      },
    ]);
    await expect(
      view.getByRole("heading", { name: "Nothing needs your answer." }),
    ).toBeVisible();
    await expect(
      view.getByRole("button", { name: "Done 24", exact: true }),
    ).toBeVisible();
  } finally {
    await client.close();
  }
});
