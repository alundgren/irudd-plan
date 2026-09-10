import { usePlanningFeed } from "./use-planning-feed.js";
import { useCallback, useRef, useState } from "react";
import type { AppendPlanningRequest } from "../contract/planning.js";
import { PlanningRequestError, submitPlanning } from "./planning-api.js";

export type PlanningSaveState = {
  target: string | null;
  phase: "sending" | "uncertain" | "error" | "saved";
  error?: string;
  recovered?: boolean;
};
type PendingSave = {
  target: string | null;
  draft: string;
  request: AppendPlanningRequest;
};

export function usePlanningConversation(planId: string) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState<string>();
  const [save, setSave] = useState<PlanningSaveState>();
  const unsentAnswers = useRef<Record<string, { body: string; value: string }>>(
    {},
  );
  const pending = useRef<PendingSave | undefined>(undefined);
  const inFlight = useRef(false);
  const resetDrafts = useCallback((message: string) => {
    const preserved = Object.values(unsentAnswers.current)
      .filter((answer) => answer.value.trim())
      .map((answer) => `Unsent answer to "${answer.body}":\n${answer.value}`);
    if (preserved.length)
      setNote((current) =>
        [current, ...preserved].filter(Boolean).join("\n\n"),
      );
    unsentAnswers.current = {};
    setDrafts({});
    setRecoveryMessage(message);
  }, []);
  const { conversation, connected, delivery, refreshConversation } =
    usePlanningFeed(planId, resetDrafts);
  const targetExists = (target: string | null) =>
    target === null ||
    conversation?.entries.some(
      (entry) => entry.id === target && entry.kind === "question",
    );
  const visibleTarget = save && targetExists(save.target) ? save.target : null;

  const submit = async (target: string | null) => {
    if (inFlight.current || !conversation) return;
    if (pending.current) {
      if (target !== visibleTarget) return;
    } else {
      if (!connected) return;
      const question = conversation.entries.find(
        (entry) => entry.id === target && entry.kind === "question",
      );
      const draft = target === null ? note : (drafts[target] ?? "");
      if (!draft.trim() || (target !== null && !question)) return;
      pending.current = {
        target,
        draft,
        request: {
          contractVersion: "v1",
          planId,
          operationId: crypto.randomUUID(),
          expectedRevision: conversation.revision,
          expectedDigest: conversation.cursor.digest,
          entries: [
            {
              id: crypto.randomUUID(),
              section: question?.section ?? "Discussion",
              kind: question ? "answer" : "note",
              body: draft.trim(),
              ...(question ? { replyTo: question.id } : {}),
            },
          ],
        },
      };
    }
    const submitted = pending.current;
    inFlight.current = true;
    setSave({ target: submitted.target, phase: "sending" });
    try {
      await submitPlanning(submitted.request);
      pending.current = undefined;
      if (submitted.target === null) {
        setNote((current) => (current === submitted.draft ? "" : current));
      } else {
        const id = submitted.target;
        setDrafts((current) =>
          current[id] === submitted.draft ? { ...current, [id]: "" } : current,
        );
        if (unsentAnswers.current[id]?.value === submitted.draft)
          delete unsentAnswers.current[id];
      }
      await refreshConversation();
      setSave({ target: submitted.target, phase: "saved" });
    } catch (caught) {
      const known =
        caught instanceof PlanningRequestError && caught.status < 500;
      if (known) {
        pending.current = undefined;
        await refreshConversation();
      }
      setSave({
        target: submitted.target,
        phase: known ? "error" : "uncertain",
        error: known
          ? "Conversation changed or this save was rejected. Review the latest entries, then save again. Your draft is still here."
          : "Could not confirm this save. Retry to check the original submission. Your draft is still here.",
      });
    } finally {
      inFlight.current = false;
    }
  };
  return {
    delivery,
    conversation,
    drafts,
    note,
    recoveryMessage,
    connected,
    save: save
      ? {
          ...save,
          target: visibleTarget,
          recovered: save.target !== visibleTarget,
        }
      : undefined,
    setAnswer: (id: string, value: string) => {
      unsentAnswers.current[id] = {
        body:
          conversation?.entries.find((entry) => entry.id === id)?.body ?? id,
        value,
      };
      setDrafts((current) => ({ ...current, [id]: value }));
      setSave((current) =>
        current?.target === id && current.phase === "saved"
          ? undefined
          : current,
      );
    },
    setNote: (value: string) => {
      setNote(value);
      setSave((current) =>
        current?.target === null && current.phase === "saved"
          ? undefined
          : current,
      );
    },
    submit,
  };
}
