import { createContext, useContext, useState, type ReactNode } from "react";
import { usePlanningConversation } from "./use-planning-conversation.js";

type Session = ReturnType<typeof usePlanningConversation> & {
  questionToFocus: { id: string } | undefined;
  openQuestion: (id: string) => void;
};
const PlanningSession = createContext<Session | undefined>(undefined);
export const usePlanningSession = () => useContext(PlanningSession);

export function PlanningSessionProvider({
  planId,
  enabled,
  children,
}: {
  readonly planId: string;
  readonly enabled: boolean;
  readonly children: ReactNode;
}) {
  return enabled ? (
    <PrivateSession key={planId} planId={planId}>
      {children}
    </PrivateSession>
  ) : (
    children
  );
}
function PrivateSession({
  planId,
  children,
}: {
  readonly planId: string;
  readonly children: ReactNode;
}) {
  const conversation = usePlanningConversation(planId);
  const [questionToFocus, setQuestionToFocus] = useState<{ id: string }>();
  return (
    <PlanningSession.Provider
      value={{
        ...conversation,
        questionToFocus,
        openQuestion: (id) => setQuestionToFocus({ id }),
      }}
    >
      {children}
    </PlanningSession.Provider>
  );
}
