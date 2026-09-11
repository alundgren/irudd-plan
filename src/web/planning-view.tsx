import { useEffect, useState } from "react";
import type { Plan } from "../contract/plan.js";
import { usePlanningSession } from "./planning-session.js";
import { usePlanningViewport } from "./use-planning-viewport.js";
import { PlanningHistory } from "./planning-history.js";
import { GuidedPlanning } from "./guided-planning.js";
import { Button } from "./ui/button.js";
import "./guided-planning.css";

export function PlanningView({
  planId,
  plan,
  onBack,
  active,
}: {
  readonly planId: string;
  readonly plan: Plan;
  readonly onBack: () => void;
  readonly active: boolean;
}) {
  const controller = usePlanningSession()!;
  const { questionToFocus } = controller;
  const viewport = usePlanningViewport();
  const [history, setHistory] = useState(false);
  const [openedHistory, setOpenedHistory] = useState(false);
  useEffect(() => {
    if (questionToFocus) {
      setOpenedHistory(true);
      setHistory(true);
    }
  }, [questionToFocus]);
  return (
    <section
      ref={viewport.ref}
      className="planning-view"
      style={{ maxHeight: viewport.height }}
      aria-label="Planning conversation"
    >
      {questionToFocus && (
        <Button variant="outline" onClick={onBack}>
          Back to work item
        </Button>
      )}
      <div className={`guided-mode ${history ? "guided-history-mode" : ""}`}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpenedHistory(true);
            setHistory(!history);
          }}
        >
          {history ? "Guided planning" : "Conversation canvas"}
        </Button>
      </div>
      <div className="guided-container" hidden={history}>
        {!history ? (
          <GuidedPlanning plan={plan} controller={controller} />
        ) : null}
      </div>
      <div className="guided-container" hidden={!history}>
        {openedHistory ? (
          <PlanningHistory
            planId={planId}
            goal={plan.epicGoal}
            controller={controller}
            focusQuestion={active && history ? questionToFocus : undefined}
          />
        ) : null}
      </div>
    </section>
  );
}
