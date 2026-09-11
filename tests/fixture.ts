import { createHash } from "node:crypto";

import type { Plan } from "../src/contract/plan.js";

export const fixtureSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 160"><rect width="320" height="160" fill="#effbf9"/><path d="M50 80h220" stroke="#178e89" stroke-width="8"/><circle cx="50" cy="80" r="24" fill="#dc9c58"/><circle cx="270" cy="80" r="24" fill="#178e89"/></svg>';

export const fixtureAssetDigest = `sha256:${createHash("sha256")
  .update(fixtureSvg)
  .digest("hex")}`;

export function fixtureAssetUpload(planId: string) {
  return {
    contractVersion: "v1" as const,
    planId,
    assetId: "asset-contract",
    mediaType: "image/svg+xml",
    caption: "Contract diagram",
    role: "binding-reference" as const,
    bytesBase64: Buffer.from(fixtureSvg).toString("base64"),
  };
}

export function tenItemPlan(planId = "plan-alpha"): Plan {
  return {
    contractVersion: "v1",
    planId,
    repository: { provider: "github", owner: "example", name: "project" },
    epicGoal: "Ship a private planning service",
    contexts: [
      {
        id: "context-auth",
        title: "Authentication rules",
        body: "Every request resolves an owner from a verified identity.",
        reason: "Plans are private.",
        source: "Security requirements",
        requiredContextIds: ["context-base"],
        assetIds: ["asset-contract"],
      },
      {
        id: "context-base",
        title: "Service boundary",
        body: "The service owns plan data but does not schedule agents.",
        reason: "Keep execution decisions outside the service.",
        requiredContextIds: [],
        assetIds: [],
      },
      {
        id: "context-optional",
        title: "Optional investigation",
        body: "Read this only when the selected task needs it.",
        reason: "Avoid sending unrelated detail.",
        requiredContextIds: [],
        assetIds: [],
      },
    ],
    decisions: [
      {
        id: "decision-database",
        state: "decided",
        title: "Use SQLite",
        body: "Use SQLite with generated migrations.",
        reason: "The deployment target is one self-hosted node.",
        source: "Plan decision",
        requiredContextIds: ["context-base"],
        assetIds: [],
      },
    ],
    assets: [
      {
        id: "asset-contract",
        uri: `irudd-plan://plans/${encodeURIComponent(planId)}/assets/asset-contract?digest=${encodeURIComponent(fixtureAssetDigest)}`,
        mediaType: "image/svg+xml",
        digest: fixtureAssetDigest,
        caption: "Contract diagram",
        role: "binding-reference",
        available: true,
      },
    ],
    items: Array.from({ length: 10 }, (_, index) => {
      const number = index + 1;
      return {
        id: `item-${number}`,
        title: `Work item ${number}`,
        shortGoal: `Complete task ${number}`,
        goal: `Implement selected goal ${number}`,
        requirements: [`Sibling specification ${number}`],
        relevantPriorArt: [`Prior art ${number}`],
        checks: [`Check ${number}`],
        deferrals: [`Deferred ${number}`],
        completionExpectation: `Task ${number} is verified`,
        acceptanceCriteria: [
          { id: `criterion-${number}`, text: `Criterion ${number}` },
        ],
        requiredContextIds: number === 1 ? ["context-auth"] : [],
        requiredDecisionIds: number === 1 ? ["decision-database"] : [],
        requiredAssetIds: number === 1 ? ["asset-contract"] : [],
        relatedItemIds: number === 1 ? ["item-2"] : [],
      };
    }),
  };
}

export function clonePlan(plan: Plan): Plan {
  return structuredClone(plan);
}
