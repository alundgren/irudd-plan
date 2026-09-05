import { describe, expect, it } from "vite-plus/test";

import { clonePlan, fixtureAssetUpload, tenItemPlan } from "./fixture.js";
import { startTestServer } from "./test-service.js";

const browserHeaders = { authorization: "Bearer browser-a" };

describe("private browser reads and live updates", () => {
  it("closes active update streams during graceful server shutdown", async () => {
    const running = await startTestServer();
    const plan = tenItemPlan("shutdown-plan");
    await running.service.uploadAsset(
      "owner-a",
      fixtureAssetUpload(plan.planId),
    );
    await running.service.write("owner-a", {
      operationId: "shutdown-create",
      expectedVersion: null,
      plan,
    });
    const response = await fetch(
      `${running.url}/api/plans/${plan.planId}/events`,
      { headers: browserHeaders },
    );
    expect(response.status).toBe(200);
    const events = eventReader(response);
    await expect(events.next("ready")).resolves.toContain('"version":1');
    await expect(withTimeout(running.close(), 2_000)).resolves.toBeUndefined();
    await expect(withTimeout(events.done(), 2_000)).resolves.toBe(true);
  });

  it("delivers committed revisions within two seconds and stops after credential expiry", async () => {
    const running = await startTestServer();
    const plan = tenItemPlan("live-plan");
    await running.service.uploadAsset(
      "owner-a",
      fixtureAssetUpload(plan.planId),
    );
    await running.service.write("owner-a", {
      operationId: "live-create",
      expectedVersion: null,
      plan,
    });

    const response = await fetch(
      `${running.url}/api/plans/${plan.planId}/events`,
      { headers: browserHeaders },
    );
    expect(response.status).toBe(200);
    const events = eventReader(response);
    await expect(events.next("ready")).resolves.toContain('"version":1');

    const revisionSource = clonePlan(plan);
    const revised = {
      ...revisionSource,
      items: revisionSource.items.map((item, index) =>
        index === 0
          ? { ...item, requirements: ["Changed while the browser stayed open"] }
          : item,
      ),
    };
    const startedAt = Date.now();
    await running.service.write("owner-a", {
      operationId: "live-update",
      expectedVersion: 1,
      plan: revised,
    });
    const update = await withTimeout(events.next("plan-update"), 2_000);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(update).toContain('"version":2');
    expect(update).not.toContain(plan.planId);

    const current = await fetch(`${running.url}/api/plans/${plan.planId}`, {
      headers: browserHeaders,
    });
    await expect(current.json()).resolves.toMatchObject({
      version: 2,
      plan: {
        items: expect.arrayContaining([
          expect.objectContaining({ id: "item-1" }),
        ]),
      },
    });

    running.expire("browser-a");
    const third = {
      ...clonePlan(revised),
      epicGoal: "A committed revision that must not cross expired auth",
    };
    await running.service.write("owner-a", {
      operationId: "live-after-expiry",
      expectedVersion: 2,
      plan: third,
    });
    await expect(withTimeout(events.done(), 2_000)).resolves.toBe(true);
    await running.close();
  });

  it("resynchronizes to the current view and reveals nothing across owners", async () => {
    const running = await startTestServer();
    const plan = tenItemPlan("owner-a-private-plan");
    await running.service.uploadAsset(
      "owner-a",
      fixtureAssetUpload(plan.planId),
    );
    await running.service.write("owner-a", {
      operationId: "sync-create",
      expectedVersion: null,
      plan,
    });
    const secondSource = clonePlan(plan);
    const second = {
      ...secondSource,
      items: secondSource.items.map((item, index) =>
        index === 1 ? { ...item, goal: "Second committed goal" } : item,
      ),
    };
    await running.service.write("owner-a", {
      operationId: "sync-two",
      expectedVersion: 1,
      plan: second,
    });
    const thirdSource = clonePlan(second);
    const third = {
      ...thirdSource,
      items: thirdSource.items.map((item, index) =>
        index === 2 ? { ...item, goal: "Third committed goal" } : item,
      ),
    };
    await running.service.write("owner-a", {
      operationId: "sync-three",
      expectedVersion: 2,
      plan: third,
    });

    const reconnected = await fetch(
      `${running.url}/api/plans/${plan.planId}/events`,
      { headers: browserHeaders },
    );
    const events = eventReader(reconnected);
    await expect(events.next("ready")).resolves.toContain('"version":3');
    const current = await fetch(`${running.url}/api/plans/${plan.planId}`, {
      headers: browserHeaders,
    });
    const body = (await current.json()) as {
      version: number;
      plan: { items: Array<{ id: string }> };
    };
    expect(body.version).toBe(3);
    expect(new Set(body.plan.items.map((item) => item.id)).size).toBe(10);

    for (const suffix of ["", "/events"]) {
      const denied = await fetch(
        `${running.url}/api/plans/${plan.planId}${suffix}`,
        { headers: { authorization: "Bearer browser-b" } },
      );
      expect(denied.status).toBe(404);
      expect(await denied.text()).not.toContain(plan.planId);
    }
    await events.cancel();
    await running.close();
  });
});

function eventReader(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    async next(name: string): Promise<string> {
      while (true) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary >= 0) {
          const event = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (event.includes(`event: ${name}`)) return event;
          continue;
        }
        const result = await reader.read();
        if (result.done) throw new Error(`Stream closed before ${name}`);
        buffer += decoder.decode(result.value, { stream: true });
      }
    },
    async done(): Promise<boolean> {
      return (await reader.read()).done;
    },
    async cancel(): Promise<void> {
      await reader.cancel();
    },
  };
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Timed out")), milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
