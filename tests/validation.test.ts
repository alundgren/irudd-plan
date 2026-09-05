import { describe, expect, it } from "vitest";

import { PlanError } from "../src/contract/errors.js";
import { canonicalJson, validatePlan } from "../src/domain/validate-plan.js";
import { clonePlan, tenItemPlan } from "./fixture.js";

function expectCode(action: () => void, code: PlanError["code"]): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `Expected ${code}`).toBeInstanceOf(PlanError);
  expect((thrown as PlanError).code).toBe(code);
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

  it("allows IDs to repeat in separate entity and acceptance-criterion namespaces", () => {
    const plan = clonePlan(tenItemPlan());
    const sharedId = plan.contexts[0]!.id;
    const changed = {
      ...plan,
      decisions: plan.decisions.map((decision, index) =>
        index === 0 ? { ...decision, id: sharedId } : decision,
      ),
      items: plan.items.map((item) => ({
        ...item,
        acceptanceCriteria: item.acceptanceCriteria.map((criterion, index) =>
          index === 0 ? { ...criterion, id: "criterion-shared" } : criterion,
        ),
        requiredDecisionIds: item.requiredDecisionIds.map(() => sharedId),
      })),
    };
    expect(() => validatePlan(changed)).not.toThrow();
  });

  it("orders canonical object keys by code unit", () => {
    expect(canonicalJson({ ä: 1, z: 2, a: 3 })).toBe('{"a":3,"z":2,"ä":1}');
  });
});
