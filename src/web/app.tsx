import { FeedbackDialog } from "./feedback-dialog.js";
import {
  AlertTriangle,
  ListTree,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { Plan } from "../contract/plan.js";
import {
  fetchPlans,
  type PlanDocument,
  type PlanListEntry,
} from "./client-api.js";
import { RetentionNotice } from "./retention-notice.js";
import { FeedbackPanel } from "./feedback-panel.js";
import {
  type FeedbackTarget,
  type FeedbackItem,
  newFeedbackItem,
  feedbackSubject,
} from "./feedback.js";
import { PlanCanvas } from "./plan-canvas.js";
import { Button } from "./ui/button.js";
import { type ConnectionState, useLivePlan } from "./use-live-plan.js";
import { useLocalFeedback } from "./use-local-feedback.js";

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

  return (
    <PlanWorkspace
      document={document}
      connection={connection}
      changedSections={changedSections}
      isPublic={route.publicOwnerId !== undefined}
      publicationStatus={accessLabel(document.access)}
      {...(route.itemId === undefined ? {} : { itemId: route.itemId })}
      onSelect={navigate}
      onShowPlans={() =>
        window.location.assign(
          route.publicOwnerId === undefined ? "/" : planPath(route),
        )
      }
    />
  );
}

function PlanWorkspace({
  document,
  connection,
  changedSections,
  isPublic,
  publicationStatus,
  itemId,
  onSelect,
  onShowPlans,
}: {
  readonly document: PlanDocument;
  readonly connection: ConnectionState;
  readonly changedSections: ReadonlySet<string>;
  readonly isPublic: boolean;
  readonly publicationStatus: string;
  readonly itemId?: string;
  readonly onSelect: (itemId?: string) => void;
  readonly onShowPlans: () => void;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [composer, setComposer] = useState<{
    item: FeedbackItem;
    editing: boolean;
  }>();
  const [selectedFeedback, setSelectedFeedback] = useState<
    FeedbackItem | undefined
  >();
  const [feedbackToReveal, setFeedbackToReveal] = useState<FeedbackItem>();
  const selectFeedback = (item: FeedbackItem) => {
    const selection = { ...item };
    setSelectedFeedback(selection);
    setFeedbackToReveal(selection);
    setFeedbackOpen(true);
  };
  const {
    state: feedbackState,
    storageError,
    add,
    update,
    remove,
    assessTrial,
  } = useLocalFeedback(document.feedbackScope, document.plan.planId);
  const addFeedback = useCallback(
    (target: FeedbackTarget) => {
      const item = newFeedbackItem(
        document.plan.planId,
        document.version,
        target,
      );
      setComposer({
        item: { ...item, subject: feedbackSubject(target, document.plan) },
        editing: false,
      });
    },
    [document.plan, document.version],
  );
  const selectionDeleted =
    itemId !== undefined &&
    !document.plan.items.some((item) => item.id === itemId);

  return (
    <main className="review-app">
      <ReviewHeader
        plan={document.plan}
        version={document.version}
        connection={connection}
        isPublic={isPublic}
        publicationStatus={publicationStatus}
        {...(isPublic || document.retention === undefined
          ? {}
          : { retention: document.retention })}
        feedbackCount={feedbackState.items.length}
        onShowPlans={onShowPlans}
        feedbackOpen={feedbackOpen}
        onOpenFeedback={() => {
          setFeedbackOpen(!feedbackOpen);
        }}
      />
      {selectionDeleted ? (
        <DeletedNotice onOpenOverview={() => onSelect()} />
      ) : null}
      <div
        className={`review-content ${feedbackOpen ? "feedback-visible" : ""}`}
      >
        <PlanCanvas
          plan={document.plan}
          {...(selectionDeleted || itemId === undefined
            ? {}
            : { selectedItemId: itemId })}
          changedSections={changedSections}
          feedbackItems={feedbackState.items}
          onSelect={onSelect}
          onAddFeedback={addFeedback}
          {...(feedbackToReveal === undefined
            ? {}
            : { focusedFeedback: feedbackToReveal })}
          {...(selectedFeedback === undefined
            ? {}
            : { selectedFeedbackId: selectedFeedback.id })}
          onSelectFeedback={selectFeedback}
        />
        {feedbackOpen ? (
          <FeedbackPanel
            plan={document.plan}
            version={document.version}
            items={feedbackState.items}
            {...(storageError === undefined ? {} : { storageError })}
            {...(feedbackState.trialAssessment === undefined
              ? {}
              : { trialAssessment: feedbackState.trialAssessment })}
            onClose={() => {
              setFeedbackOpen(false);
            }}
            {...(selectedFeedback === undefined
              ? {}
              : { selectedItem: selectedFeedback })}
            onSelect={selectFeedback}
            onEdit={(item) =>
              setComposer({
                item: {
                  ...item,
                  subject:
                    item.subject ?? feedbackSubject(item.target, document.plan),
                },
                editing: true,
              })
            }
            onRemove={remove}
            onAssessTrial={assessTrial}
          />
        ) : null}
      </div>
      {composer === undefined ? null : (
        <FeedbackDialog
          key={composer.item.id}
          item={composer.item}
          editing={composer.editing}
          onClose={() => setComposer(undefined)}
          onSave={(item) => {
            if (composer.editing)
              update(item.id, item.requestedChange, item.subject ?? "");
            else add(item);
            setComposer(undefined);
            setSelectedFeedback(item);
            setFeedbackToReveal(undefined);
            setFeedbackOpen(true);
          }}
        />
      )}
    </main>
  );
}

function DeletedNotice({
  onOpenOverview,
}: {
  readonly onOpenOverview: () => void;
}) {
  return (
    <div className="deleted-notice" role="status">
      <AlertTriangle aria-hidden="true" size={18} />
      This work item was deleted from the current plan.
      <Button size="sm" variant="outline" onClick={onOpenOverview}>
        Open overview
      </Button>
    </div>
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
              {plan.retention !== undefined ? (
                <RetentionNotice retention={plan.retention} />
              ) : null}
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
  return accessLabel(plan.access);
}

function accessLabel(access: PlanListEntry["access"]): string {
  if (access.published) return "Published";
  if (!access.repositoryVerified) return "Private · repository unverified";
  if (access.repositoryVisibility === "private") {
    return "Private repository";
  }
  return "Private";
}

function ReviewHeader({
  plan,
  version,
  connection,
  isPublic,
  publicationStatus,
  retention,
  feedbackCount,
  onShowPlans,
  onOpenFeedback,
  feedbackOpen,
}: {
  readonly plan: Plan;
  readonly version: number;
  readonly connection: ConnectionState;
  readonly isPublic: boolean;
  readonly publicationStatus: string;
  readonly retention?: PlanDocument["retention"];
  readonly feedbackCount: number;
  readonly onShowPlans: () => void;
  readonly onOpenFeedback: () => void;
  readonly feedbackOpen: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <header className="review-header">
      <Button variant="ghost" size="sm" onClick={onShowPlans}>
        <ListTree aria-hidden="true" size={16} />
        {isPublic ? "Overview" : "Plans"}
      </Button>
      <h1 title={plan.epicGoal}>{plan.epicGoal}</h1>
      <div className="review-header-status" role="status">
        <span className={`connection ${connection}`}>
          {connection === "live" ? (
            `Live · r${version}`
          ) : (
            <>
              <RefreshCw aria-hidden="true" size={12} />
              {connection} · r{version}
            </>
          )}
        </span>
        {retention?.status === "scheduled" ? (
          <span>Scheduled expiry</span>
        ) : null}
        {retention?.status === "unknown" ? (
          <span>Retention unknown</span>
        ) : null}
      </div>
      <button
        type="button"
        className="plan-details-toggle"
        aria-expanded={detailsOpen}
        aria-controls="plan-details"
        onClick={() => setDetailsOpen((open) => !open)}
      >
        Plan details
      </button>
      <Button
        variant="outline"
        size="sm"
        className="feedback-open-button"
        aria-expanded={feedbackOpen}
        onClick={onOpenFeedback}
      >
        <MessageSquareText aria-hidden="true" size={15} />
        Feedback {feedbackCount}
      </Button>
      {detailsOpen ? (
        <div className="plan-details-content" id="plan-details">
          <p>
            {plan.repository.owner}/{plan.repository.name} · {publicationStatus}
          </p>
          {retention === undefined ? null : (
            <RetentionNotice retention={retention} />
          )}
        </div>
      ) : null}
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
