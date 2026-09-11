import type { Decision, DecisionReadiness } from "../contract/plan.js";

export function decisionReadiness(
  decisions: ReadonlyArray<Decision>,
): DecisionReadiness {
  const humanNeededIds = decisions
    .filter((decision) => decision.state === "human-needed")
    .map((decision) => decision.id);
  const implementerDecidesIds = decisions
    .filter((decision) => decision.state === "implementer-decides")
    .map((decision) => decision.id);
  return {
    canStart: humanNeededIds.length === 0,
    canComplete:
      humanNeededIds.length === 0 && implementerDecidesIds.length === 0,
    humanNeededIds,
    implementerDecidesIds,
  };
}
