import { describe, expect, it } from "vite-plus/test";

import { decode, WritePlanRequest } from "../src/contract/plan.js";
import { clonePlan, tenItemPlan } from "./fixture.js";

function expectInvalid(value: unknown): void {
  expect(() => decode(WritePlanRequest, value)).toThrow();
}

describe("write plan contract", () => {
  it("rejects empty nested content", () => {
    const base = clonePlan(tenItemPlan());
    const invalidPlans = [
      {
        ...base,
        items: base.items.map((item, index) =>
          index === 0 ? { ...item, requirements: ["   "] } : item,
        ),
      },
      {
        ...base,
        items: base.items.map((item, index) =>
          index === 0
            ? {
                ...item,
                acceptanceCriteria: [
                  { ...item.acceptanceCriteria[0]!, text: "" },
                ],
              }
            : item,
        ),
      },
      {
        ...base,
        contexts: base.contexts.map((context, index) =>
          index === 0 ? { ...context, body: "" } : context,
        ),
      },
      {
        ...base,
        assets: base.assets.map((asset, index) =>
          index === 0 ? { ...asset, uri: "" } : asset,
        ),
      },
    ];

    for (const plan of invalidPlans) {
      expectInvalid({
        operationId: "invalid-content",
        expectedVersion: null,
        plan,
      });
    }
  });

  it.each([-1, 0, 1.5])(
    "rejects invalid expectedVersion %s",
    (expectedVersion) => {
      expectInvalid({
        operationId: "invalid-version",
        expectedVersion,
        plan: tenItemPlan(),
      });
    },
  );
});
