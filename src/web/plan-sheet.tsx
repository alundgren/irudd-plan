import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

import type {
  AssetDescriptor,
  Decision,
  Plan,
  SharedContext,
  WorkItem,
} from "../contract/plan.js";
import { RichText } from "./rich-text.js";
import { collectRequiredContent } from "./required-content.js";
import type { FeedbackItem, FeedbackTarget } from "./feedback.js";
import {
  addSectionFeedback,
  FeedbackButton,
  feedbackCount,
  FeedbackSectionTitle,
} from "./feedback-target.js";
import { Badge } from "./ui/badge.js";

interface PlanSheetProps {
  readonly plan: Plan;
  readonly item?: WorkItem;
  readonly selected: boolean;
  readonly changedSections: ReadonlySet<string>;
  readonly feedbackItems: ReadonlyArray<FeedbackItem>;
  readonly onSelect: (itemId?: string) => void;
  readonly onAddFeedback: (target: FeedbackTarget) => void;
  readonly onReference: (itemId: string, assetId: string) => void;
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
  feedbackItems,
  onSelect,
  onAddFeedback,
}: PlanSheetProps) {
  return (
    <article
      className={`plan-sheet overview-sheet nodrag nopan ${selected ? "selected" : ""}`}
      aria-label="Epic overview"
    >
      <section
        className={changedSections.has("epic-goal") ? "changed" : ""}
        data-section="epic-goal"
        data-feedback-container
      >
        <FeedbackSectionTitle
          label="Goal"
          count={feedbackCount(feedbackItems, undefined, "epic-goal")}
          onAdd={(event) =>
            addSectionFeedback(
              event,
              plan,
              undefined,
              "epic-goal",
              "Epic goal",
              onAddFeedback,
            )
          }
        />
        <h2>{plan.epicGoal}</h2>
      </section>
      <details className="overview-index-disclosure">
        <summary>Work item index</summary>
        <div
          className={`overview-index ${changedSections.has("overview-items") ? "changed" : ""}`}
          data-section="overview-items"
          data-feedback-container
        >
          <FeedbackSectionTitle
            label={`${plan.items.length} work items`}
            count={feedbackCount(feedbackItems, undefined, "overview-items")}
            onAdd={(event) =>
              addSectionFeedback(
                event,
                plan,
                undefined,
                "overview-items",
                "Work item index",
                onAddFeedback,
              )
            }
          />
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
      </details>
    </article>
  );
}

function ItemSheet({
  plan,
  item,
  selected,
  changedSections,
  feedbackItems,
  onAddFeedback,
  onReference,
}: PlanSheetProps & { readonly item: WorkItem }) {
  const { contexts, decisions, assets } = collectRequiredContent(plan, item);
  const feedbackProps = { plan, item, feedbackItems, onAddFeedback };
  return (
    <article
      className={`plan-sheet item-sheet nodrag nopan ${selected ? "selected" : ""}`}
      aria-label={item.title}
      data-item-id={item.id}
    >
      <SheetHeader
        eyebrow={item.id}
        title={item.title}
        selected={selected}
        changed={changedSections.has(`${item.id}:header`)}
        feedbackCount={feedbackCount(feedbackItems, item.id, "header")}
        onAddFeedback={(event) =>
          addSectionFeedback(
            event,
            plan,
            item.id,
            "header",
            "Work item heading",
            onAddFeedback,
          )
        }
      />
      <div className="sheet-content">
        <FeedbackSheetSection
          {...feedbackProps}
          sectionId="goal"
          label="Goal"
          changedSections={changedSections}
        >
          <RichText text={item.goal} />
        </FeedbackSheetSection>

        {decisions.length > 0 && (
          <FeedbackSheetSection
            {...feedbackProps}
            sectionId="decisions"
            label="Open decisions"
            changedSections={changedSections}
          >
            <DecisionList decisions={decisions} />
          </FeedbackSheetSection>
        )}

        <FeedbackSheetSection
          {...feedbackProps}
          sectionId="requirements"
          label="Requirements"
          changedSections={changedSections}
        >
          <Checklist values={item.requirements} />
        </FeedbackSheetSection>

        <FeedbackSheetSection
          {...feedbackProps}
          sectionId="checks"
          label="Checks"
          changedSections={changedSections}
        >
          <Checklist
            values={[
              ...item.checks,
              ...item.acceptanceCriteria.map((criterion) => criterion.text),
            ]}
          />
        </FeedbackSheetSection>

        <VisualReferences
          {...feedbackProps}
          assets={assets}
          onReference={onReference}
          changedSections={changedSections}
        />
        <TechnicalDetail
          {...feedbackProps}
          contexts={contexts}
          changedSections={changedSections}
        />
      </div>
    </article>
  );
}

interface ItemFeedbackProps {
  readonly plan: Plan;
  readonly item: WorkItem;
  readonly feedbackItems: ReadonlyArray<FeedbackItem>;
  readonly onAddFeedback: (target: FeedbackTarget) => void;
}

function FeedbackSheetSection({
  plan,
  item,
  feedbackItems,
  onAddFeedback,
  sectionId,
  label,
  changedSections,
  children,
}: ItemFeedbackProps & {
  readonly sectionId: string;
  readonly label: string;
  readonly changedSections: ReadonlySet<string>;
  readonly children: ReactNode;
}) {
  const id = `${item.id}:${sectionId}`;
  return (
    <SheetSection
      id={id}
      title={label}
      changed={changedSections.has(id)}
      feedbackCount={feedbackCount(feedbackItems, item.id, sectionId)}
      onAddFeedback={(event) =>
        addSectionFeedback(
          event,
          plan,
          item.id,
          sectionId,
          label,
          onAddFeedback,
        )
      }
    >
      {children}
    </SheetSection>
  );
}

function DecisionList({
  decisions,
}: {
  readonly decisions: ReadonlyArray<Decision>;
}) {
  return decisions.map((decision) => (
    <div className="decision" key={decision.id}>
      <h4>{decision.title}</h4>
      <RichText text={decision.body} />
      <p className="reason">Why: {decision.reason}</p>
    </div>
  ));
}

function VisualReferences({
  item,
  assets,
  changedSections,
  onReference,
}: {
  readonly item: WorkItem;
  readonly assets: ReadonlyArray<AssetDescriptor>;
  readonly changedSections: ReadonlySet<string>;
  readonly onReference: (itemId: string, assetId: string) => void;
}) {
  if (assets.length === 0) return null;
  return (
    <SheetSection
      id={`${item.id}:visuals`}
      title="Visual references"
      changed={changedSections.has(`${item.id}:visuals`)}
    >
      <ul className="reference-links">
        {assets.map((asset) => (
          <li key={asset.id}>
            <button
              type="button"
              className="reference-link"
              onClick={() => onReference(item.id, asset.id)}
            >
              {asset.caption} <ArrowRight aria-hidden="true" size={14} />
            </button>
          </li>
        ))}
      </ul>
    </SheetSection>
  );
}

function TechnicalDetail({
  plan,
  item,
  feedbackItems,
  onAddFeedback,
  contexts,
  changedSections,
}: ItemFeedbackProps & {
  readonly contexts: ReadonlyArray<SharedContext>;
  readonly changedSections: ReadonlySet<string>;
}) {
  return (
    <FeedbackSheetSection
      plan={plan}
      item={item}
      feedbackItems={feedbackItems}
      onAddFeedback={onAddFeedback}
      sectionId="technical"
      label="Technical detail"
      changedSections={changedSections}
    >
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
    </FeedbackSheetSection>
  );
}

function SheetHeader({
  eyebrow,
  title,
  selected,
  changed,
  feedbackCount,
  onAddFeedback,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly selected: boolean;
  readonly changed: boolean;
  readonly feedbackCount?: number;
  readonly onAddFeedback?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <header
      className={`sheet-header ${changed ? "changed" : ""}`}
      data-section="header"
      data-feedback-container
    >
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <div className="sheet-header-actions">
        {onAddFeedback === undefined ? null : (
          <FeedbackButton
            label="Work item heading"
            count={feedbackCount ?? 0}
            onAdd={onAddFeedback}
          />
        )}
        {selected ? <Badge className="selected-badge">Reading</Badge> : null}
      </div>
    </header>
  );
}

function SheetSection({
  id,
  title,
  changed,
  feedbackCount,
  onAddFeedback,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly changed: boolean;
  readonly feedbackCount?: number;
  readonly onAddFeedback?: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly children: ReactNode;
}) {
  return (
    <section
      className={changed ? "changed" : ""}
      data-section={id}
      data-feedback-container
    >
      {onAddFeedback === undefined ? (
        <h3>{title}</h3>
      ) : (
        <FeedbackSectionTitle
          label={title}
          count={feedbackCount ?? 0}
          onAdd={onAddFeedback}
        />
      )}
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
