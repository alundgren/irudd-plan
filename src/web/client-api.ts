import type { Plan } from "../contract/plan.js";

export interface PlanDocument {
  readonly plan: Plan;
  readonly version: number;
  readonly access: {
    readonly repositoryVerified: boolean;
    readonly repositoryVisibility?: "public" | "private";
    readonly published: boolean;
    readonly publishedAt?: string;
  };
  readonly feedbackScope: string;
}

export interface PlanListEntry {
  readonly planId: string;
  readonly epicGoal: string;
  readonly repository: { readonly owner: string; readonly name: string };
  readonly version: number;
  readonly updatedAt: string;
  readonly access: PlanDocument["access"];
}

export async function fetchPlans(
  signal?: AbortSignal,
): Promise<PlanListEntry[]> {
  const response = await fetch(
    "/api/plans",
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw new Error(await responseMessage(response));
  const body = (await response.json()) as { plans: PlanListEntry[] };
  return body.plans;
}

export async function fetchPlan(
  planId: string,
  signal?: AbortSignal,
  publicOwnerId?: string,
): Promise<PlanDocument> {
  const path =
    publicOwnerId === undefined
      ? `/api/plans/${encodeURIComponent(planId)}`
      : `/public/plans/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(planId)}/document`;
  const response = await fetch(path, signal === undefined ? {} : { signal });
  if (!response.ok) throw new Error(await responseMessage(response));
  return (await response.json()) as PlanDocument;
}

async function responseMessage(response: Response): Promise<string> {
  if (response.status === 404) return "Plan is unavailable";
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}
