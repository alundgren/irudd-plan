import { ArrowRight, CheckCircle2, Compass } from "lucide-react";
import type { ReactNode } from "react";

import type { Plan, WorkItem } from "../contract/plan.js";
import { AssetView } from "./asset-view.js";
import { RichText } from "./rich-text.js";
import { collectRequiredContent } from "./required-content.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";

interface PlanSheetProps {
  readonly plan: Plan;
  readonly item?: WorkItem;
  readonly selected: boolean;
  readonly changedSections: ReadonlySet<string>;
  readonly onSelect: (itemId?: string) => void;
}

export function PlanSheet(props: PlanSheetProps) {
  return props.item === undefined ? (
    <OverviewSheet {...props} />
  ) : (
    <ItemSheet {...props} item={props.item} />
  );
}

function OverviewSheet({
  plan,
  selected,
  changedSections,
  onSelect,
}: PlanSheetProps) {
  return (
    <article
      className={`plan-sheet overview-sheet ${selected ? "selected" : ""}`}
      aria-label="Epic overview"
    >
      <SheetHeader
        eyebrow="Epic overview"
        title={`${plan.repository.owner}/${plan.repository.name}`}
        selected={selected}
        changed={false}
      />
      <section
        className={changedSections.has("epic-goal") ? "changed" : ""}
        data-section="epic-goal"
      >
        <h3>Goal</h3>
        <RichText text={plan.epicGoal} />
      </section>
      <div
        className={`overview-index ${changedSections.has("overview-items") ? "changed" : ""}`}
        data-section="overview-items"
      >
        <h3>{plan.items.length} work items</h3>
        {plan.items.map((item) => (
          <button
            type="button"
            className={`index-row nodrag nopan ${changedSections.has(`${item.id}:header`) ? "changed" : ""}`}
            key={item.id}
            onClick={() => onSelect(item.id)}
          >
            <span>{item.title}</span>
            <ArrowRight aria-hidden="true" size={14} />
          </button>
        ))}
      </div>
    </article>
  );
}

function ItemSheet({
  plan,
  item,
  selected,
  changedSections,
  onSelect,
}: PlanSheetProps & { readonly item: WorkItem }) {
  const { contexts, decisions, assets } = collectRequiredContent(plan, item);
  return (
    <article
      className={`plan-sheet item-sheet ${selected ? "selected" : ""}`}
      aria-label={item.title}
    >
      <SheetHeader
        eyebrow={item.id}
        title={item.title}
        selected={selected}
        changed={changedSections.has(`${item.id}:header`)}
      />
      <div className="sheet-scroll nodrag nopan nowheel">
        <SheetSection
          id={`${item.id}:goal`}
          title="Goal"
          changed={changedSections.has(`${item.id}:goal`)}
        >
          <RichText text={item.goal} />
        </SheetSection>

        {decisions.length > 0 && (
          <SheetSection
            id={`${item.id}:decisions`}
            title="Open decisions"
            changed={changedSections.has(`${item.id}:decisions`)}
          >
            {decisions.map((decision) => (
              <div className="decision" key={decision.id}>
                <h4>{decision.title}</h4>
                <RichText text={decision.body} />
                <p className="reason">Why: {decision.reason}</p>
              </div>
            ))}
          </SheetSection>
        )}

        <SheetSection
          id={`${item.id}:requirements`}
          title="Requirements"
          changed={changedSections.has(`${item.id}:requirements`)}
        >
          <Checklist values={item.requirements} />
        </SheetSection>

        <SheetSection
          id={`${item.id}:checks`}
          title="Checks"
          changed={changedSections.has(`${item.id}:checks`)}
        >
          <Checklist
            values={[
              ...item.checks,
              ...item.acceptanceCriteria.map((criterion) => criterion.text),
            ]}
          />
        </SheetSection>

        {assets.length > 0 && (
          <SheetSection
            id={`${item.id}:visuals`}
            title="Visual references"
            changed={changedSections.has(`${item.id}:visuals`)}
          >
            {assets.map((asset) => (
              <AssetView key={asset.id} planId={plan.planId} asset={asset} />
            ))}
          </SheetSection>
        )}

        <details
          className={`technical-details ${changedSections.has(`${item.id}:technical`) ? "changed" : ""}`}
          data-section={`${item.id}:technical`}
        >
          <summary className="nodrag nopan">Technical detail</summary>
          <h4>Required context</h4>
          {contexts.map((context) => (
            <div className="required-context" key={context.id}>
              <h5>{context.title}</h5>
              <RichText text={context.body} />
              <p className="reason">Why: {context.reason}</p>
            </div>
          ))}
          <h4>Relevant prior art</h4>
          <Checklist values={item.relevantPriorArt} />
          <h4>Deferred</h4>
          <Checklist values={item.deferrals} />
          <h4>Completion</h4>
          <RichText text={item.completionExpectation} />
        </details>

        <nav className="related-items" aria-label="Related plan items">
          <Button variant="outline" size="sm" onClick={() => onSelect()}>
            <Compass aria-hidden="true" size={14} /> Overview
          </Button>
          {item.relatedItemIds.map((relatedId) => {
            const related = plan.items.find(
              (candidate) => candidate.id === relatedId,
            );
            return related === undefined ? null : (
              <Button
                variant="ghost"
                size="sm"
                key={related.id}
                onClick={() => onSelect(related.id)}
              >
                {related.title} <ArrowRight aria-hidden="true" size={14} />
              </Button>
            );
          })}
        </nav>
      </div>
    </article>
  );
}

function SheetHeader({
  eyebrow,
  title,
  selected,
  changed,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly selected: boolean;
  readonly changed: boolean;
}) {
  return (
    <header
      className={`sheet-header ${changed ? "changed" : ""}`}
      data-section="header"
    >
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {selected ? <Badge className="selected-badge">Reading</Badge> : null}
    </header>
  );
}

function SheetSection({
  id,
  title,
  changed,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly changed: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section className={changed ? "changed" : ""} data-section={id}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Checklist({ values }: { readonly values: ReadonlyArray<string> }) {
  return (
    <ul className="checklist">
      {values.map((value, index) => (
        <li key={`${index}:${value}`}>
          <CheckCircle2 aria-hidden="true" size={16} />
          <span>{value}</span>
        </li>
      ))}
    </ul>
  );
}
