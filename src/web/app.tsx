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
    route.publicOwnerId,
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
          ? planPath(route)
          : `${planPath(route)}/items/${encodeURIComponent(itemId)}`;
      window.history.pushState({}, "", path);
      setRoute(readRoute());
    },
    [route],
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
        isPublic={route.publicOwnerId !== undefined}
        published={document.access.published}
        onShowPlans={() =>
          window.location.assign(
            route.publicOwnerId === undefined ? "/" : planPath(route),
          )
        }
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
      {error !== undefined ? null : plans === undefined ? (
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
              <span>
                Revision {plan.version} · {publicationLabel(plan)}
              </span>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}

function publicationLabel(plan: PlanListEntry): string {
  if (plan.access.published) return "Published";
  if (!plan.access.repositoryVerified) return "Private · repository unverified";
  if (plan.access.repositoryVisibility === "private") {
    return "Private repository";
  }
  return "Private";
}

function ReviewHeader({
  plan,
  version,
  connection,
  isPublic,
  published,
  onShowPlans,
}: {
  readonly plan: Plan;
  readonly version: number;
  readonly connection: ConnectionState;
  readonly isPublic: boolean;
  readonly published: boolean;
  readonly onShowPlans: () => void;
}) {
  return (
    <header className="review-header">
      <Button variant="ghost" size="sm" onClick={onShowPlans}>
        <ListTree aria-hidden="true" size={16} />
        {isPublic ? "Overview" : "Plans"}
      </Button>
      <div>
        <p className="eyebrow">
          {plan.repository.owner}/{plan.repository.name}
        </p>
        <h1>{plan.epicGoal}</h1>
      </div>
      <div className="header-status">
        <Badge className={`connection ${connection}`}>
          {connection === "live" ? (
            <CircleDot aria-hidden="true" size={12} />
          ) : (
            <RefreshCw aria-hidden="true" size={12} />
          )}
          {connection === "live" ? `Live · r${version}` : connection}
        </Badge>
        <Badge>{published ? "Published" : "Private"}</Badge>
      </div>
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

interface Route {
  readonly planId?: string;
  readonly itemId?: string;
  readonly publicOwnerId?: string;
}

function readRoute(): Route {
  const publicMatch = window.location.pathname.match(
    /^\/public\/plans\/([^/]+)\/([^/]+)(?:\/items\/([^/]+))?$/,
  );
  if (publicMatch?.[1] !== undefined && publicMatch[2] !== undefined) {
    return {
      publicOwnerId: decodeSegment(publicMatch[1]),
      planId: decodeSegment(publicMatch[2]),
      ...(publicMatch[3] === undefined
        ? {}
        : { itemId: decodeSegment(publicMatch[3]) }),
    };
  }
  const match = window.location.pathname.match(
    /^\/plans\/([^/]+)(?:\/items\/([^/]+))?$/,
  );
  return {
    ...(match?.[1] === undefined ? {} : { planId: decodeSegment(match[1]) }),
    ...(match?.[2] === undefined ? {} : { itemId: decodeSegment(match[2]) }),
  };
}

function planPath(route: Route): string {
  const planId = encodeURIComponent(route.planId ?? "");
  return route.publicOwnerId === undefined
    ? `/plans/${planId}`
    : `/public/plans/${encodeURIComponent(route.publicOwnerId)}/${planId}`;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : "Request failed";
}
