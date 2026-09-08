import { PanelsTopLeft } from "lucide-react";
import { AssetThumbnail } from "./asset-thumbnail.js";
import {
  addSectionFeedback,
  feedbackCount,
  FeedbackButton,
} from "./feedback-target.js";
import type { WorkItem } from "../contract/plan.js";
import type { PlanCanvasProps } from "./plan-canvas.js";
import { PlanSheet } from "./plan-sheet.js";
import { ReferenceSheet, sheetNodeId } from "./reference-sheet.js";
import { collectRequiredContent } from "./required-content.js";

export function ItemFrame(
  props: PlanCanvasProps & {
    readonly item: WorkItem;
    readonly summary: boolean;
    readonly selected: boolean;
    readonly referenceId: string | undefined;
    readonly onReference: (itemId: string, assetId: string) => void;
  },
) {
  const { item, plan, summary, onSelect, onReference } = props;
  const assets = collectRequiredContent(plan, item).assets;
  const count = props.feedbackItems.filter(
    (note) => note.target.kind !== "canvas" && note.target.itemId === item.id,
  ).length;
  return (
    <section
      className="item-frame"
      data-frame-item={item.id}
      aria-label={`Section: ${item.title}`}
    >
      <div className="frame-heading" data-feedback-container>
        <h2>
          <button
            type="button"
            className="item-title-bar"
            onClick={() => onSelect(item.id)}
          >
            <span>{String(plan.items.indexOf(item) + 1).padStart(2, "0")}</span>
            <span>{item.title}</span>
            <span aria-hidden="true">↗</span>
          </button>
        </h2>
        {!summary && (
          <FeedbackButton
            label="Work item heading"
            count={feedbackCount(props.feedbackItems, item.id, "header")}
            onAdd={(event) =>
              addSectionFeedback(
                event,
                plan,
                item.id,
                "header",
                "Work item heading",
                props.onAddFeedback,
              )
            }
          />
        )}
      </div>
      {!summary && assets.length > 0 && (
        <button
          type="button"
          className="jump-reference canvas-link-icon"
          aria-label="Jump to reference"
          title="Jump to reference"
          onClick={() => onReference(item.id, assets[0]!.id)}
        >
          <PanelsTopLeft size={18} aria-hidden="true" />
        </button>
      )}
      <button
        className="item-summary"
        type="button"
        onClick={() => onSelect(item.id)}
        aria-label={`Read ${item.title}`}
      >
        {assets[0] && (
          <AssetThumbnail
            key={`${assets[0].id}:${assets[0].digest}`}
            planId={plan.planId}
            asset={assets[0]}
          />
        )}
        <span>{item.shortGoal}</span>
        <span className="summary-meta">
          {assets.length} visual{" "}
          {assets.length === 1 ? "reference" : "references"} · {count}{" "}
          {count === 1 ? "comment" : "comments"}
        </span>
        {assets.map((asset) => (
          <span className="summary-reference" key={asset.id}>
            {asset.caption}
            {!asset.available ? " · Unavailable" : ""}
          </span>
        ))}
      </button>
      <div className="item-body" inert={summary}>
        <PlanSheet
          {...props}
          selected={props.selected && props.referenceId === undefined}
        />
        {assets.length > 0 && (
          <div className="item-references">
            {assets.map((asset) => (
              <ReferenceSheet
                key={asset.id}
                planId={plan.planId}
                item={item}
                asset={asset}
                selected={props.selected && props.referenceId === asset.id}
                changed={props.changedSections.has(
                  sheetNodeId(item.id, asset.id),
                )}
                feedbackItems={props.feedbackItems}
                onReturn={() => onSelect(item.id)}
                onAddFeedback={props.onAddFeedback}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
