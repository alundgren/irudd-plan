import { describe, expect, it } from "vitest";

import { PlanError } from "../src/contract/errors.js";
import { validatePlan } from "../src/domain/validate-plan.js";
import { clonePlan, tenItemPlan } from "./fixture.js";

function expectCode(action: () => void, code: PlanError["code"]): void {
  try {
    action();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(PlanError);
    expect((error as PlanError).code).toBe(code);
  }
}

describe("plan validation", () => {
  it("rejects duplicate stable ids", () => {
    const plan = clonePlan(tenItemPlan());
    const changed = {
      ...plan,
      items: plan.items.map((item, index) =>
        index === 1 ? { ...item, id: plan.items[0]!.id } : item,
      ),
    };
    expectCode(() => validatePlan(changed), "DUPLICATE_ID");
  });

  it("rejects broken references", () => {
    const plan = clonePlan(tenItemPlan());
    const changed = {
      ...plan,
      items: plan.items.map((item, index) =>
        index === 0 ? { ...item, requiredContextIds: ["missing"] } : item,
      ),
    };
    expectCode(() => validatePlan(changed), "REFERENCE_MISSING");
  });

  it("rejects unavailable required assets", () => {
    const plan = clonePlan(tenItemPlan());
    const changed = {
      ...plan,
      assets: plan.assets.map((asset, index) =>
        index === 0 ? { ...asset, available: false } : asset,
      ),
    };
    expectCode(() => validatePlan(changed), "ASSET_UNAVAILABLE");
  });

  it("rejects cycles in required shared context", () => {
    const plan = clonePlan(tenItemPlan());
    const changed = {
      ...plan,
      contexts: plan.contexts.map((context, index) =>
        index === 1 ? { ...context, requiredContextIds: ["context-auth"] } : context,
      ),
    };
    expectCode(() => validatePlan(changed), "REFERENCE_CYCLE");
  });
});
