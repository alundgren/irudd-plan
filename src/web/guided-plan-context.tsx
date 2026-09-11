import type { Plan } from "../contract/plan.js";
import { RichText } from "./rich-text.js";

export function GuidedPlanContext({ plan }: { readonly plan: Plan }) {
  return (
    <aside className="guided-plan">
      <p className="guided-label">Current plan</p>
      <h2>{plan.epicGoal}</h2>
      {plan.decisions[0] ? (
        <blockquote>
          <RichText text={plan.decisions[0].body} />
        </blockquote>
      ) : null}
      <p>
        Accepted specification. Saved answers stay in discussion until the
        planner updates it.
      </p>
      <details>
        <summary>Read current plan</summary>
        {plan.decisions.map((decision) => (
          <section key={decision.id}>
            <h3>{decision.title}</h3>
            <RichText text={decision.body} />
          </section>
        ))}
        {plan.items.map((item) => (
          <section key={item.id}>
            <h3>{item.title}</h3>
            <RichText text={item.goal} />
            <ul>
              {item.requirements.map((requirement) => (
                <li key={requirement}>{requirement}</li>
              ))}
            </ul>
          </section>
        ))}
        {!plan.items.length && !plan.decisions.length ? (
          <p>No implementation requirements yet.</p>
        ) : null}
      </details>
    </aside>
  );
}
