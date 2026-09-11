import { expect, it } from "vite-plus/test";
import { Decision, decode, type Plan } from "../src/contract/plan.js";
import { decisionReadiness } from "../src/domain/decision-readiness.js";
import { PlanService } from "../src/domain/plan-service.js";
import { createTestStore } from "./test-service.js";
import { tenItemPlan } from "./fixture.js";

const decided: Decision = {
  id: "choice",
  state: "decided",
  title: "Storage",
  body: "Use SQLite",
  reason: "One host",
  requiredContextIds: [],
  assetIds: [],
};
const delegated: Decision = {
  ...decided,
  state: "implementer-decides",
  question: "Which storage mode?",
  constraints: "Use SQLite only",
};
const human: Decision = {
  ...decided,
  state: "human-needed",
  question: "Keep records?",
  questionId: "question",
};

it("requires explicit states and valid fields without manufacturing defaults", () => {
  for (const value of [decided, delegated, human])
    expect(decode(Decision, value)).toEqual(value);
  for (const value of [
    { ...decided, state: undefined },
    { ...decided, state: "approved" },
    { ...human, question: undefined },
    { ...human, questionId: " " },
    { ...human, constraints: "unexpected" },
    { ...delegated, constraints: " " },
    { ...delegated, question: undefined },
    { ...delegated, questionId: "question" },
    { ...decided, questionId: "question" },
  ])
    expect(() => decode(Decision, value)).toThrow();
});

it("derives readiness for empty, settled, delegated, human and mixed choices", () => {
  for (const [choices, canStart, canComplete] of [
    [[], true, true],
    [[decided], true, true],
    [[delegated], true, false],
    [[human], false, false],
    [[human, { ...delegated, id: "other" }], false, false],
  ] as const)
    expect(decisionReadiness(choices)).toMatchObject({ canStart, canComplete });
  expect(
    decisionReadiness([human, { ...delegated, id: "other" }]),
  ).toMatchObject({
    humanNeededIds: ["choice"],
    implementerDecidesIds: ["other"],
  });
});

async function setup() {
  const store = await createTestStore();
  const service = new PlanService(store);
  const original = tenItemPlan();
  const plan: Plan = {
    ...original,
    assets: [],
    contexts: [],
    decisions: [delegated],
    items: original.items.map((item, index) => ({
      ...item,
      requiredContextIds: [],
      requiredAssetIds: [],
      requiredDecisionIds: index < 2 ? ["choice"] : [],
    })),
  };
  await service.write("owner-a", {
    operationId: "create",
    expectedVersion: null,
    plan,
  });
  const identity = { contractVersion: "v1" as const, planId: plan.planId };
  const packet = (itemId = "item-1") =>
    service.getItem("owner-a", { ...identity, itemId });
  const update = async (decision: Decision, operationId: string) => {
    const current = await packet();
    return service.patch("owner-a", {
      ...identity,
      operationId,
      expectedVersion: current.specificationCursor.revision,
      expectedDigest: current.specificationCursor.digest,
      decisions: [decision],
    });
  };
  const append = async (
    entries: Parameters<typeof service.appendPlanning>[1]["entries"],
    author: "agent" | "human" = "agent",
  ) => {
    const current = await service.getPlanning("owner-a", plan.planId);
    return service.appendPlanning(
      "owner-a",
      {
        ...identity,
        operationId: `conversation-${current.headCursor.revision}`,
        expectedRevision: current.headCursor.revision,
        expectedDigest: current.headCursor.digest,
        entries,
      },
      author,
    );
  };
  return { store, service, plan, identity, packet, update, append };
}

it("records a delegated outcome from a selected packet, rejects stale writes and replays receipts", async () => {
  const { service, plan, identity, packet } = await setup();
  const first = await packet();
  const shared = await packet("item-2");
  const unrelated = await packet("item-3");
  expect(
    await service.checkPacket("owner-a", {
      ...identity,
      itemId: "item-1",
      packetVersion: first.packetVersion,
    }),
  ).toMatchObject({
    status: "unchanged",
    decisionReadiness: { canStart: true, canComplete: false },
  });
  const request = {
    ...identity,
    operationId: "outcome",
    expectedVersion: first.specificationCursor.revision,
    expectedDigest: first.specificationCursor.digest,
    decisions: [
      {
        ...first.decisions[0]!,
        state: "decided" as const,
        body: "Use SQLite WAL mode",
        reason: "Readers can continue during a write",
      },
    ],
  };
  const receipt = await service.patch("owner-a", request);
  expect(await service.patch("owner-a", request)).toMatchObject({
    replayed: true,
    cursor: receipt.cursor,
  });
  await expect(
    service.patch("owner-a", {
      ...request,
      operationId: "stale",
      decisions: [delegated],
    }),
  ).rejects.toMatchObject({ code: "PLAN_CONFLICT" });
  const current = await packet();
  expect(current.decisionReadiness).toMatchObject({
    canStart: true,
    canComplete: true,
  });
  expect(current.decisions[0]!.constraints).toBe(delegated.constraints);
  expect((await packet("item-2")).packetVersion).not.toBe(shared.packetVersion);
  expect((await packet("item-3")).packetVersion).toBe(unrelated.packetVersion);
  expect((await service.current("owner-a", plan.planId))!.plan.items).toEqual(
    plan.items,
  );
  expect(
    await service.checkPacket("owner-a", {
      ...identity,
      itemId: "item-1",
      packetVersion: current.packetVersion,
    }),
  ).toMatchObject({
    status: "unchanged",
    decisionReadiness: { canComplete: true },
  });
  const delta = await service.syncPlan("owner-a", {
    ...identity,
    cursor: first.specificationCursor,
  });
  expect(delta).toMatchObject({
    changes: [
      { kind: "upsert", collection: "decisions", value: request.decisions[0] },
    ],
  });
});

it("waits through saved answers and resolution markers until the specification changes, without sending history", async () => {
  const { service, identity, packet, update, append } = await setup();
  await append([
    {
      id: "question",
      section: "Retention",
      kind: "question",
      body: "Keep records?",
    },
  ]);
  await update(human, "human");
  const before = await packet();
  await append(
    [
      {
        id: "answer",
        replyTo: "question",
        section: "Retention",
        kind: "answer",
        body: "Private answer",
      },
    ],
    "human",
  );
  await append([
    {
      id: "resolution",
      replyTo: "question",
      section: "Retention",
      kind: "resolved",
      body: "Private resolution alone is insufficient",
    },
  ]);
  await append(
    Array.from({ length: 30 }, (_, index) => ({
      id: `old-${index}`,
      replyTo: "question",
      section: "Retention",
      kind: "note" as const,
      body: `Private old discussion ${index}`,
    })),
  );
  const after = await packet();
  expect(after.packetVersion).toBe(before.packetVersion);
  expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  expect(after.decisionReadiness).toMatchObject({
    canStart: false,
    canComplete: false,
  });
  const { questionId: _questionId, ...outcome } = human;
  await service.patch("owner-a", {
    ...identity,
    operationId: "reconcile",
    expectedVersion: after.specificationCursor.revision,
    expectedDigest: after.specificationCursor.digest,
    decisions: [
      {
        ...outcome,
        state: "decided",
        body: "Keep records",
        reason: "Human answer",
      },
    ],
    items: [{ ...after.item, requirements: ["Keep records"] }],
  });
  expect((await packet()).decisionReadiness.canComplete).toBe(true);
  await update(human, "reopen");
  expect((await packet()).decisionReadiness.canStart).toBe(false);
  await update(delegated, "reassign");
  expect((await packet()).decisionReadiness).toMatchObject({
    canStart: true,
    canComplete: false,
  });
});

it("rejects missing, non-question, cross-plan and cross-owner question links", async () => {
  const { service, plan, update, append } = await setup();
  await append([
    { id: "note", section: "Scope", kind: "note", body: "Not a question" },
  ]);
  await service.write("owner-b", {
    operationId: "other-owner",
    expectedVersion: null,
    plan,
  });
  const otherPlan = { ...plan, planId: "other-plan" };
  await service.write("owner-a", {
    operationId: "other-plan",
    expectedVersion: null,
    plan: otherPlan,
  });
  for (const [ownerId, planId, id] of [
    ["owner-b", plan.planId, "foreign-owner"],
    ["owner-a", otherPlan.planId, "foreign-plan"],
  ]) {
    const conversation = await service.getPlanning(ownerId!, planId!);
    await service.appendPlanning(
      ownerId!,
      {
        contractVersion: "v1",
        planId: planId!,
        operationId: id!,
        expectedRevision: 0,
        expectedDigest: conversation.cursor.digest,
        entries: [
          {
            id: id!,
            section: "Scope",
            kind: "question",
            body: "Private question",
          },
        ],
      },
      "agent",
    );
  }
  for (const questionId of ["missing", "note", "foreign-owner", "foreign-plan"])
    await expect(
      update({ ...human, questionId }, `link-${questionId}`),
    ).rejects.toMatchObject({
      code: "REFERENCE_MISSING",
      message: "Decision question is unavailable",
    });
});
