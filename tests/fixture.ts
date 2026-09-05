import type { Plan } from "../src/contract/plan.js";

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
        uri: "https://example.test/contract.svg",
        mediaType: "image/svg+xml",
        digest: "sha256:fixture",
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
        acceptanceCriteria: [{ id: `criterion-${number}`, text: `Criterion ${number}` }],
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
