import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { IruddMcpClient } from "../../src/client/mcp-client.js";

test("canvas receives companion state without polling or claiming runtime activity", async ({
  page,
  baseURL,
}) => {
  const planId = `queue-${randomUUID()}`;
  const client = new IruddMcpClient(new URL(`${baseURL}/mcp`), "token-a");
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  await client.connect();
  try {
    await client.callTool("write_plan", {
      operationId: randomUUID(),
      expectedVersion: null,
      plan: {
        contractVersion: "v1",
        planId,
        repository: { provider: "github", owner: "example", name: "project" },
        epicGoal: "Test queue delivery status",
        items: [],
        contexts: [],
        decisions: [],
        assets: [],
      },
    });
    let reads = 0;
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname.endsWith("/planning") &&
        request.method() === "GET"
      )
        reads++;
    });
    await page.goto(`/plans/${planId}`);
    await expect(
      page.getByText("Server connected · receiving conversation updates"),
    ).toBeVisible();
    const connectionId = randomUUID();
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
    expect(response.status).toBe(200);
    reader = response.body!.getReader();
    await reader.read();
    await expect(
      page.getByText(
        "Queue companion connected · new saved answers will be sent to the linked session.",
      ),
    ).toBeVisible();
    const report = await fetch(
      `${baseURL}/companion/plans/${planId}/delivery`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer token-a",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          connectionId,
          state: "queued",
          queuedThrough: 0,
        }),
      },
    );
    expect(report.ok).toBe(true);
    await report.body?.cancel();
    await expect(
      page.getByText(
        "Answers queued for the agent. Running status is unknown.",
      ),
    ).toBeVisible();
    const settledReads = reads;
    await page.waitForTimeout(2500);
    expect(reads).toBe(settledReads);
    controller.abort();
    await reader.cancel().catch(() => {});
    await expect(
      page.getByText(
        "Queue companion disconnected · saved answers will wait for reconnection.",
      ),
    ).toBeVisible();
  } finally {
    controller.abort();
    await reader?.cancel().catch(() => {});
    await client.close();
  }
});
