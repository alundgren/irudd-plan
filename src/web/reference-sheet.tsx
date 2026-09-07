import type { AssetDescriptor, WorkItem } from "../contract/plan.js";
import type { FeedbackItem, FeedbackTarget } from "./feedback.js";
import { assetFeedbackCount } from "./feedback-target.js";
import { AssetView } from "./asset-view.js";

export function sheetNodeId(itemId?: string, assetId?: string): string {
  return JSON.stringify([itemId ?? null, assetId ?? null]);
}

export function ReferenceSheet({
  planId,
  item,
  asset,
  selected,
  changed,
  feedbackItems,
  onReturn,
  onAddFeedback,
}: {
  readonly planId: string;
  readonly item: WorkItem;
  readonly asset: AssetDescriptor;
  readonly selected: boolean;
  readonly changed: boolean;
  readonly feedbackItems: ReadonlyArray<FeedbackItem>;
  readonly onReturn: () => void;
  readonly onAddFeedback: (target: FeedbackTarget) => void;
}) {
  return (
    <article
      className={`plan-sheet reference-sheet nodrag nopan ${selected ? "selected" : ""}`}
      aria-label={`Reference for ${item.title}: ${asset.caption}`}
      data-item-id={item.id}
      data-asset-id={asset.id}
    >
      <header>
        <p className="eyebrow">
          {asset.role === "binding-reference"
            ? "Acceptance reference"
            : "Illustration"}
        </p>
        <h2>Reference for {item.title}</h2>
        <button type="button" className="reference-link" onClick={onReturn}>
          Return to {item.title}
        </button>
      </header>
      <div
        data-section={`${item.id}:visuals`}
        className={changed ? "changed" : ""}
      >
        <AssetView
          key={`${asset.id}:${asset.digest}:${asset.available}`}
          planId={planId}
          asset={asset}
          feedbackCount={assetFeedbackCount(feedbackItems, item.id, asset.id)}
          onAddFeedback={() =>
            onAddFeedback({
              kind: "asset",
              itemId: item.id,
              sectionId: "visuals",
              assetId: asset.id,
              assetDigest: asset.digest,
              caption: asset.caption,
            })
          }
        />
      </div>
    </article>
  );
}
