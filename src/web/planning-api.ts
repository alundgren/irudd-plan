import type { SyncCursor } from "../contract/sync.js";
import type { PlanningPage } from "../domain/conversation-sync.js";
import type { AppendPlanningRequest } from "../contract/planning.js";

export async function fetchPlanning(
  planId: string,
  signal?: AbortSignal,
  cursor?: SyncCursor,
): Promise<PlanningPage> {
  const response = await fetch(
    path(planId) +
      (cursor ? `?cursor=${encodeURIComponent(JSON.stringify(cursor))}` : ""),
    signal === undefined ? {} : { signal },
  );
  if (!response.ok)
    throw new PlanningRequestError(
      response.status,
      "Planning conversation is unavailable",
    );
  return response.json() as Promise<PlanningPage>;
}

export async function submitPlanning(
  request: AppendPlanningRequest,
): Promise<void> {
  const response = await fetch(path(request.planId), {
    method: "POST",
    headers: { "content-type": "application/json", "x-irudd-planning": "1" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const result = (await response.json()) as { error?: string };
    throw new PlanningRequestError(
      response.status,
      result.error ?? "Answers could not be saved",
    );
  }
}
export class PlanningRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function path(planId: string) {
  return `/api/plans/${encodeURIComponent(planId)}/planning`;
}
