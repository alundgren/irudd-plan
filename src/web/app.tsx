import { AlertTriangle, CircleDot, ListTree, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { Plan } from "../contract/plan.js";
import { fetchPlans, type PlanListEntry } from "./client-api.js";
import { PlanCanvas } from "./plan-canvas.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { type ConnectionState, useLivePlan } from "./use-live-plan.js";

export function App() {
  const [route, setRoute] = useState(readRoute);
  const [plans, setPlans] = useState<PlanListEntry[] | undefined>(undefined);
  const [listError, setListError] = useState<string | undefined>(undefined);
  const { document, error, connection, changedSections, retry } = useLivePlan(
    route.planId,
  );

  const loadPlans = useCallback(async () => {
    try {
      setPlans(await fetchPlans());
    } catch (caught) {
      setListError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    if (route.planId === undefined) void loadPlans();
  }, [loadPlans, route.planId]);

  useEffect(() => {
    const updateRoute = (): void => setRoute(readRoute());
    window.addEventListener("popstate", updateRoute);
    return () => window.removeEventListener("popstate", updateRoute);
  }, []);

  const navigate = useCallback(
    (itemId?: string) => {
      if (route.planId === undefined) return;
      const path =
        itemId === undefined
          ? `/plans/${encodeURIComponent(route.planId)}`
          : `/plans/${encodeURIComponent(route.planId)}/items/${encodeURIComponent(itemId)}`;
      window.history.pushState({}, "", path);
      setRoute(readRoute());
    },
    [route.planId],
  );

  if (route.planId === undefined) {
    return (
      <PlanList
        {...(plans === undefined ? {} : { plans })}
        {...(listError === undefined ? {} : { error: listError })}
      />
    );
  }
  if (error !== undefined && document === undefined) {
    return <UnavailableState message={error} onRetry={() => void retry()} />;
  }
  if (document === undefined) return <LoadingState />;

  const selectionDeleted =
    route.itemId !== undefined &&
    !document.plan.items.some((item) => item.id === route.itemId);
  return (
    <main className="review-app">
      <ReviewHeader
        plan={document.plan}
        version={document.version}
        connection={connection}
        onShowPlans={() => window.location.assign("/")}
      />
      {selectionDeleted ? (
        <div className="deleted-notice" role="status">
          <AlertTriangle aria-hidden="true" size={18} />
          This work item was deleted from the current plan.
          <Button size="sm" variant="outline" onClick={() => navigate()}>
            Open overview
          </Button>
        </div>
      ) : null}
      <PlanCanvas
        plan={document.plan}
        {...(selectionDeleted || route.itemId === undefined
          ? {}
          : { selectedItemId: route.itemId })}
        changedSections={changedSections}
        onSelect={navigate}
      />
    </main>
  );
}

function PlanList({
  plans,
  error,
}: {
  readonly plans?: PlanListEntry[];
  readonly error?: string;
}) {
  return (
    <main className="plan-list-page">
      <header>
        <p className="eyebrow">Private workspace</p>
        <h1>Plans ready for review</h1>
        <p>Open a plan to read its current committed revision.</p>
      </header>
      {error !== undefined ? <p className="state-card error">{error}</p> : null}
      {plans === undefined ? (
        <LoadingState />
      ) : plans.length === 0 ? (
        <section className="state-card empty-state">
          <ListTree aria-hidden="true" />
          <h2>No plans yet</h2>
          <p>An authenticated MCP write will make a plan appear here.</p>
        </section>
      ) : (
        <div className="plan-grid">
          {plans.map((plan) => (
            <a
              href={`/plans/${encodeURIComponent(plan.planId)}`}
              key={plan.planId}
            >
              <span className="repository">
                {plan.repository.owner}/{plan.repository.name}
              </span>
              <h2>{plan.epicGoal}</h2>
              <span>Revision {plan.version}</span>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}

function ReviewHeader({
  plan,
  version,
  connection,
  onShowPlans,
}: {
  readonly plan: Plan;
  readonly version: number;
  readonly connection: ConnectionState;
  readonly onShowPlans: () => void;
}) {
  return (
    <header className="review-header">
      <Button variant="ghost" size="sm" onClick={onShowPlans}>
        <ListTree aria-hidden="true" size={16} /> Plans
      </Button>
      <div>
        <p className="eyebrow">
          {plan.repository.owner}/{plan.repository.name}
        </p>
        <h1>{plan.epicGoal}</h1>
      </div>
      <Badge className={`connection ${connection}`}>
        {connection === "live" ? (
          <CircleDot aria-hidden="true" size={12} />
        ) : (
          <RefreshCw aria-hidden="true" size={12} />
        )}
        {connection === "live" ? `Live · r${version}` : connection}
      </Badge>
    </header>
  );
}

function LoadingState() {
  return (
    <div className="loading-state" role="status">
      <RefreshCw aria-hidden="true" /> Loading current plan...
    </div>
  );
}

function UnavailableState({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
  return (
    <main className="unavailable-state">
      <AlertTriangle aria-hidden="true" />
      <h1>Plan unavailable</h1>
      <p>{message}</p>
      <Button onClick={onRetry}>Try again</Button>
    </main>
  );
}

function readRoute(): { readonly planId?: string; readonly itemId?: string } {
  const match = window.location.pathname.match(
    /^\/plans\/([^/]+)(?:\/items\/([^/]+))?$/,
  );
  return {
    ...(match?.[1] === undefined
      ? {}
      : { planId: decodeURIComponent(match[1]) }),
    ...(match?.[2] === undefined
      ? {}
      : { itemId: decodeURIComponent(match[2]) }),
  };
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : "Request failed";
}
