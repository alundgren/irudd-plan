import { usePlanningFeed } from "./use-planning-feed.js";
import { useCallback, useRef, useState } from "react";
import type { AppendPlanningRequest } from "../contract/planning.js";
import { PlanningRequestError, submitPlanning } from "./planning-api.js";

export function usePlanningConversation(planId: string) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState(false);
  const unsentAnswers = useRef<Record<string, { body: string; value: string }>>(
    {},
  );
  const pending = useRef<AppendPlanningRequest | undefined>(undefined);

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
    setError(message);
  }, []);
  const { conversation, connected } = usePlanningFeed(planId, resetDrafts);

  const submit = async () => {
    if (!conversation || (!connected && !pending.current)) return;
    if (!pending.current) {
      const entries: AppendPlanningRequest["entries"][number][] =
        conversation.entries
          .filter(
            (entry) => entry.kind === "question" && drafts[entry.id]?.trim(),
          )
          .map((entry) => ({
            id: crypto.randomUUID(),
            section: entry.section,
            kind: "answer",
            body: drafts[entry.id]!.trim(),
            replyTo: entry.id,
          }));
      if (note.trim())
        entries.push({
          id: crypto.randomUUID(),
          section: "Discussion",
          kind: "note",
          body: note.trim(),
        });
      if (!entries.length) return;
      pending.current = {
        contractVersion: "v1",
        planId,
        operationId: crypto.randomUUID(),
        expectedRevision: conversation.revision,
        expectedDigest: conversation.cursor.digest,
        entries,
      };
    }
    setSending(true);
    setError(undefined);
    try {
      await submitPlanning(pending.current);
      pending.current = undefined;
      setUncertain(false);
      setDrafts({});
      unsentAnswers.current = {};
      setNote("");
      setSaved(true);
    } catch (caught) {
      if (caught instanceof PlanningRequestError && caught.status < 500) {
        pending.current = undefined;
        setUncertain(false);
      } else setUncertain(true);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save answers. Retry to check whether they were saved.",
      );
    } finally {
      setSending(false);
    }
  };
  return {
    conversation,
    drafts,
    note,
    error,
    connected,
    sending,
    uncertain,
    saved,
    setAnswer: (id: string, value: string) => {
      unsentAnswers.current[id] = {
        body:
          conversation?.entries.find((entry) => entry.id === id)?.body ?? id,
        value,
      };
      setDrafts((current) => ({ ...current, [id]: value }));
      setSaved(false);
    },
    setNote,
    setSaved,
    submit,
  };
}
