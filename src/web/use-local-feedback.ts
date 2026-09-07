import { useCallback, useEffect, useMemo, useState } from "react";

import {
  emptyFeedbackState,
  type FeedbackItem,
  type FeedbackState,
  parseFeedbackState,
  type TrialAssessment,
} from "./feedback.js";

interface LoadedFeedback {
  readonly key?: string;
  readonly state: FeedbackState;
}

export function useLocalFeedback(
  feedbackScope: string | undefined,
  planId: string | undefined,
) {
  const key = useMemo(
    () =>
      feedbackScope === undefined || planId === undefined
        ? undefined
        : `irudd-plan:feedback:v1:${feedbackScope}:${planId}`,
    [feedbackScope, planId],
  );
  const [loaded, setLoaded] = useState<LoadedFeedback>({
    state: emptyFeedbackState,
  });
  const [storageError, setStorageError] = useState<string | undefined>();

  useEffect(() => {
    if (key === undefined) {
      setLoaded({ state: emptyFeedbackState });
      return;
    }
    try {
      const stored = parseFeedbackState(localStorage.getItem(key));
      setLoaded({
        key,
        state: {
          ...stored,
          items: stored.items.filter((item) => item.planId === planId),
        },
      });
      setStorageError(undefined);
    } catch {
      setLoaded({ key, state: emptyFeedbackState });
      setStorageError(
        "Local feedback storage is unavailable. Feedback will last only until this page closes.",
      );
    }
  }, [key, planId]);

  const state = loaded.key === key ? loaded.state : emptyFeedbackState;
  const save = useCallback(
    (next: FeedbackState) => {
      setLoaded({ ...(key === undefined ? {} : { key }), state: next });
      if (key === undefined) return;
      try {
        localStorage.setItem(key, JSON.stringify(next));
        setStorageError(undefined);
      } catch {
        setStorageError(
          "Local feedback storage is unavailable. Your changes are in memory, but a reload may lose them.",
        );
      }
    },
    [key],
  );

  const add = useCallback(
    (item: FeedbackItem) => save({ ...state, items: [...state.items, item] }),
    [save, state],
  );
  const update = useCallback(
    (id: string, requestedChange: string, subject: string) =>
      save({
        ...state,
        items: state.items.map((item) =>
          item.id === id ? { ...item, requestedChange, subject } : item,
        ),
      }),
    [save, state],
  );
  const remove = useCallback(
    (id: string) =>
      save({
        ...state,
        items: state.items.filter((item) => item.id !== id),
      }),
    [save, state],
  );
  const assessTrial = useCallback(
    (trialAssessment: TrialAssessment) => save({ ...state, trialAssessment }),
    [save, state],
  );

  return { state, storageError, add, update, remove, assessTrial };
}
