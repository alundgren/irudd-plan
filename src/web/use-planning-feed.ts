import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyPlanningPage,
  PlanningSyncError,
  type PlanningReplica,
} from "./planning-replica.js";
import { fetchPlanning } from "./planning-api.js";
import type { QueueDelivery } from "../domain/planning-delivery.js";

export function usePlanningFeed(
  planId: string,
  onReset: (message: string) => void,
) {
  const [conversation, setConversation] = useState<PlanningReplica>();
  const [connected, setConnected] = useState(false);
  const [delivery, setDelivery] = useState<QueueDelivery>();
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const refreshConversation = useCallback(() => refreshRef.current(), []);
  useEffect(() => {
    const controller = new AbortController();
    let replica: PlanningReplica | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshTask: Promise<void> | undefined;
    let pending = false;
    const source = new EventSource(
      `/api/plans/${encodeURIComponent(planId)}/planning/events`,
    );
    const reset = (message: string) => {
      onReset(message);
      replica = undefined;
      setConversation(undefined);
      setConnected(false);
    };
    const readPages = async () => {
      try {
        while (pending && !controller.signal.aborted) {
          pending = false;
          const page = await fetchPlanning(
            planId,
            controller.signal,
            replica?.cursor,
          );
          if (controller.signal.aborted) return;
          if (page.status === "reset_required") {
            reset(
              "Conversation was reset. Unsent answers are in your note for review before saving.",
            );
            pending = true;
          } else {
            replica = await applyPlanningPage(planId, replica, page);
            if (controller.signal.aborted) return;
            setConversation(replica);
            setConnected(
              !page.hasMore &&
                navigator.onLine &&
                source.readyState === EventSource.OPEN,
            );
            setDelivery(page.delivery);
            if (page.hasMore) {
              pending = true;
            }
          }
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        if (caught instanceof PlanningSyncError) {
          reset(
            "Conversation sync failed. Reloading saved entries; your draft is still here.",
          );
        }
        setConnected(false);
        setDelivery(undefined);
        timer = setTimeout(() => void refresh(), 2000);
      }
    };
    const refresh = () => {
      pending = true;
      refreshTask ??= readPages().finally(() => {
        refreshTask = undefined;
      });
      return refreshTask;
    };
    refreshRef.current = refresh;
    const disconnect = () => {
      setConnected(false);
      setDelivery(undefined);
    };
    const reconnect = () => void refresh();
    source.addEventListener("planning-update", reconnect);
    source.onerror = disconnect;
    window.addEventListener("offline", disconnect);
    window.addEventListener("online", reconnect);
    return () => {
      window.removeEventListener("offline", disconnect);
      window.removeEventListener("online", reconnect);
      controller.abort();
      source.close();
      clearTimeout(timer);
    };
  }, [planId, onReset]);

  return { conversation, connected, delivery, refreshConversation };
}
