import { useEffect, useState } from "react";
import {
  applyPlanningPage,
  PlanningSyncError,
  type PlanningReplica,
} from "./planning-replica.js";
import { fetchPlanning } from "./planning-api.js";

export function usePlanningFeed(
  planId: string,
  onReset: (message: string) => void,
) {
  const [conversation, setConversation] = useState<PlanningReplica>();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let replica: PlanningReplica | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const reset = (message: string) => {
      onReset(message);
      replica = undefined;
      setConversation(undefined);
      setConnected(false);
    };
    const refresh = async () => {
      try {
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
        } else {
          replica = await applyPlanningPage(planId, replica, page);
          if (controller.signal.aborted) return;
          setConversation(replica);
          setConnected(!page.hasMore);
          if (page.hasMore) {
            timer = setTimeout(() => void refresh(), 0);
            return;
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
      }
      timer = setTimeout(() => void refresh(), 2000);
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [planId, onReset]);

  return { conversation, connected };
}
