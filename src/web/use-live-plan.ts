import { useCallback, useEffect, useRef, useState } from "react";

import type { Plan } from "../contract/plan.js";
import {
  fetchPlan,
  PlanUnavailableError,
  type PlanDocument,
} from "./client-api.js";
import { collectRequiredContent } from "./required-content.js";

export type ConnectionState = "connecting" | "live" | "reconnecting";
type LoadResult = "applied" | "failed" | "superseded";

export function useLivePlan(
  planId: string | undefined,
  publicOwnerId?: string,
) {
  const [document, setDocument] = useState<PlanDocument | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const [changedSections, setChangedSections] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const previousPlan = useRef<Plan | undefined>(undefined);
  const latestVersion = useRef(0);
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController | undefined>(undefined);
  const changeTimer = useRef<number | undefined>(undefined);

  const load = useCallback(
    async (id: string, minimumVersion = 0): Promise<LoadResult> => {
      const sequence = requestSequence.current + 1;
      requestSequence.current = sequence;
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      try {
        const next = await fetchPlan(id, controller.signal, publicOwnerId);
        if (sequence !== requestSequence.current) return "superseded";
        if (
          next.version < minimumVersion ||
          next.version < latestVersion.current
        ) {
          setError("The current plan could not be synchronized");
          return "failed";
        }
        if (previousPlan.current !== undefined) {
          setChangedSections(diffSections(previousPlan.current, next.plan));
          window.clearTimeout(changeTimer.current);
          changeTimer.current = window.setTimeout(
            () => setChangedSections(new Set()),
            5_000,
          );
        }
        previousPlan.current = next.plan;
        latestVersion.current = next.version;
        setDocument(next);
        setError(undefined);
        return "applied";
      } catch (caught) {
        if (sequence !== requestSequence.current || isAbortError(caught)) {
          return "superseded";
        }
        if (caught instanceof PlanUnavailableError) setDocument(undefined);
        setError(errorMessage(caught));
        return "failed";
      }
    },
    [publicOwnerId],
  );

  useEffect(() => {
    previousPlan.current = undefined;
    latestVersion.current = 0;
    setDocument(undefined);
    setError(undefined);
    if (planId !== undefined) void load(planId);
    return () => activeRequest.current?.abort();
  }, [load, planId]);

  useEffect(() => {
    const offline = (): void => setConnection("reconnecting");
    const online = (): void => {
      setConnection("connecting");
      setConnectionEpoch((value) => value + 1);
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  useEffect(() => {
    if (planId === undefined) return;
    const eventsPath =
      publicOwnerId === undefined
        ? `/api/plans/${encodeURIComponent(planId)}/events`
        : `/public/plans/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(planId)}/events`;
    const source = new EventSource(eventsPath);
    setConnection("connecting");
    const synchronize = async (event: Event): Promise<void> => {
      const result = await load(planId, eventVersion(event));
      if (result === "applied") setConnection("live");
      if (result === "failed") setConnection("reconnecting");
    };
    source.addEventListener("ready", (event) => void synchronize(event));
    source.addEventListener("plan-update", (event) => void synchronize(event));
    source.onerror = () => {
      setConnection("reconnecting");
      void load(planId);
    };
    return () => source.close();
  }, [connectionEpoch, load, planId, publicOwnerId]);

  const retry = useCallback(async (): Promise<void> => {
    if (planId === undefined) return;
    setConnection("connecting");
    const result = await load(planId);
    setConnection(result === "applied" ? "live" : "reconnecting");
  }, [load, planId]);

  return { document, error, connection, changedSections, retry };
}

function diffSections(previous: Plan, next: Plan): ReadonlySet<string> {
  const changed = new Set<string>();
  if (previous.epicGoal !== next.epicGoal) changed.add("epic-goal");
  compareSection(
    changed,
    "overview-items",
    previous.items.map(({ id, title }) => [id, title]),
    next.items.map(({ id, title }) => [id, title]),
  );
  for (const item of next.items) {
    const old = previous.items.find((candidate) => candidate.id === item.id);
    compareSection(
      changed,
      `${item.id}:header`,
      old === undefined ? undefined : [old.title, old.shortGoal],
      [item.title, item.shortGoal],
    );
    compareSection(changed, `${item.id}:goal`, old?.goal, item.goal);
    compareSection(
      changed,
      `${item.id}:requirements`,
      old?.requirements,
      item.requirements,
    );
    compareSection(
      changed,
      `${item.id}:checks`,
      old === undefined ? undefined : [old.checks, old.acceptanceCriteria],
      [item.checks, item.acceptanceCriteria],
    );

    const previousContent =
      old === undefined ? undefined : collectRequiredContent(previous, old);
    const nextContent = collectRequiredContent(next, item);
    compareSection(
      changed,
      `${item.id}:decisions`,
      previousContent?.decisions,
      nextContent.decisions,
    );
    compareSection(
      changed,
      `${item.id}:visuals`,
      previousContent?.assets,
      nextContent.assets,
    );
    compareSection(
      changed,
      `${item.id}:technical`,
      old === undefined
        ? undefined
        : [
            old.relevantPriorArt,
            old.deferrals,
            old.completionExpectation,
            previousContent?.contexts,
          ],
      [
        item.relevantPriorArt,
        item.deferrals,
        item.completionExpectation,
        nextContent.contexts,
      ],
    );
  }
  return changed;
}

function compareSection(
  changed: Set<string>,
  id: string,
  previous: unknown,
  next: unknown,
): void {
  if (JSON.stringify(previous) !== JSON.stringify(next)) changed.add(id);
}

function eventVersion(event: Event): number {
  if (!(event instanceof MessageEvent)) return 0;
  try {
    const value = (JSON.parse(String(event.data)) as { version?: unknown })
      .version;
    return typeof value === "number" ? value : 0;
  } catch {
    return 0;
  }
}

function isAbortError(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : "Request failed";
}
