import { describe, expect, it } from "vite-plus/test";

import type { FeedbackItem } from "../src/web/feedback.js";
import {
  buildRevisionPrompt,
  parseFeedbackState,
  sectionText,
  targetStatus,
} from "../src/web/feedback.js";
import { tenItemPlan } from "./fixture.js";

describe("browser-local feedback", () => {
  it("keeps the reviewed excerpt and reports changed or missing sections", () => {
    const plan = tenItemPlan("feedback-plan");
    const originalText = sectionText(plan, {
      itemId: "item-1",
      sectionId: "requirements",
    });
    expect(originalText).toBeDefined();
    const feedback = sectionFeedback(originalText!);
    expect(targetStatus(feedback, plan)).toBe("current");

    const revised = {
      ...plan,
      items: plan.items.map((item) =>
        item.id === "item-1"
          ? { ...item, requirements: [...item.requirements, "A new rule"] }
          : item,
      ),
    };
    expect(targetStatus(feedback, revised)).toBe("changed");
    const prompt = buildRevisionPrompt(revised, 2, [feedback]);
    expect(prompt).toContain("work item item-1, section Requirements");
    expect(prompt).toContain("Observed internal revision: 1");
    expect(prompt).toContain("Current target status: changed");
    expect(prompt).toContain("Original excerpt occurrence 1");
    expect(prompt).toContain("Keep the existing sentence");
    expect(prompt).toContain("irudd-plan://plans/feedback-plan");
    expect(prompt).toContain("check_packet");
    expect(prompt).toContain("expectedVersion");

    const removed = { ...revised, items: revised.items.slice(1) };
    expect(targetStatus(feedback, removed)).toBe("missing");
  });

  it("compares immutable asset digests and ignores empty drafts in prompts", () => {
    const base = tenItemPlan("asset-feedback");
    const asset = {
      id: "visual-1",
      uri: "irudd-plan://visual-1",
      mediaType: "image/png",
      digest: "sha256:original",
      caption: "Original visual",
      role: "illustration" as const,
      available: true,
    };
    const plan = {
      ...base,
      assets: [asset],
      items: base.items.map((item) =>
        item.id === "item-1" ? { ...item, requiredAssetIds: [asset.id] } : item,
      ),
    };
    const feedback: FeedbackItem = {
      id: "asset-note",
      planId: plan.planId,
      observedVersion: 3,
      createdAt: "2026-09-05T00:00:00.000Z",
      requestedChange: "",
      target: {
        kind: "asset",
        itemId: "item-1",
        sectionId: "visuals",
        assetId: asset.id,
        assetDigest: asset.digest,
        caption: asset.caption,
      },
    };
    expect(targetStatus(feedback, plan)).toBe("current");
    expect(buildRevisionPrompt(plan, 3, [feedback])).not.toContain(
      "asset-note",
    );
    expect(
      targetStatus(feedback, {
        ...plan,
        assets: [{ ...asset, digest: "sha256:replacement" }],
      }),
    ).toBe("changed");
    const removedFromItem = {
      ...plan,
      items: plan.items.map((item) =>
        item.id === "item-1" ? { ...item, requiredAssetIds: [] } : item,
      ),
    };
    expect(targetStatus(feedback, removedFromItem)).toBe("missing");
    expect(targetStatus(feedback, { ...plan, assets: [] })).toBe("missing");
  });

  it("reports a removed optional decision section as missing", () => {
    const plan = tenItemPlan("decision-feedback");
    const originalText = sectionText(plan, {
      itemId: "item-1",
      sectionId: "decisions",
    });
    expect(originalText).toBeDefined();
    const feedback: FeedbackItem = {
      ...sectionFeedback(originalText!),
      planId: plan.planId,
      target: {
        kind: "section",
        itemId: "item-1",
        sectionId: "decisions",
        label: "Open decisions",
        originalText: originalText!,
        originalExcerpt: "Use SQLite",
        excerptOccurrence: 1,
      },
    };
    const revised = {
      ...plan,
      items: plan.items.map((item) =>
        item.id === "item-1" ? { ...item, requiredDecisionIds: [] } : item,
      ),
    };
    expect(targetStatus(feedback, revised)).toBe("missing");
  });

  it("tracks only the visible work-item heading text", () => {
    const plan = tenItemPlan("heading-feedback");
    const item = plan.items[0]!;
    const originalText = sectionText(plan, {
      itemId: item.id,
      sectionId: "header",
    });
    expect(originalText).toBe(item.title);
    const feedback: FeedbackItem = {
      ...sectionFeedback(originalText!),
      planId: plan.planId,
      target: {
        kind: "section",
        itemId: item.id,
        sectionId: "header",
        label: "Work item heading",
        originalText: originalText!,
        originalExcerpt: originalText!,
        excerptOccurrence: 1,
      },
    };
    const revised = {
      ...plan,
      items: plan.items.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, shortGoal: `${candidate.shortGoal} Revised.` }
          : candidate,
      ),
    };
    expect(targetStatus(feedback, revised)).toBe("current");
  });

  it("rejects unsupported storage and drops malformed entries", () => {
    expect(() => parseFeedbackState('{"items":"wrong"}')).toThrow(
      "unsupported format",
    );
    expect(
      parseFeedbackState(
        JSON.stringify({ items: [{ id: "partial", target: {} }] }),
      ),
    ).toEqual({ items: [] });
  });
});

function sectionFeedback(originalText: string): FeedbackItem {
  return {
    id: "section-note",
    planId: "feedback-plan",
    observedVersion: 1,
    createdAt: "2026-09-05T00:00:00.000Z",
    requestedChange: "Keep the existing sentence but clarify the subject.",
    target: {
      kind: "section",
      itemId: "item-1",
      sectionId: "requirements",
      label: "Requirements",
      originalText,
      originalExcerpt: "Every request resolves an owner",
      excerptOccurrence: 1,
    },
  };
}
