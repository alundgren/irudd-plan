import { describe, expect, it } from "vite-plus/test";
import type { StoredPlanningEntry } from "../src/contract/planning.js";
import type { QueueDelivery } from "../src/domain/planning-delivery.js";
import {
  pendingPlanningAnswer,
  planningInlineStatus,
} from "../src/web/planning-inline-status.js";

const answer: StoredPlanningEntry = {
  id: "answer",
  kind: "answer",
  section: "Questions",
  author: "human",
  body: "CSV",
  replyTo: "formats",
  revision: 4,
  createdAt: "2026-09-10T12:00:00Z",
};
const delivery: QueueDelivery = {
  connected: true,
  threadId: "thread",
  state: "queued",
  queuedThrough: 4,
};

describe("pending answers", () => {
  it("keeps each question waiting independently and clears a linked agent reply", () => {
    const reply = {
      ...answer,
      id: "reply",
      author: "agent" as const,
      revision: 5,
    };
    expect(
      pendingPlanningAnswer("formats", [
        answer,
        { ...reply, replyTo: "other" },
      ]),
    ).toBe(answer);
    expect(pendingPlanningAnswer("formats", [answer, reply])).toBeUndefined();
    expect(
      pendingPlanningAnswer("formats", [
        answer,
        { ...reply, kind: "question" },
      ]),
    ).toBeUndefined();
    const followup = { ...answer, id: "followup", revision: 6 };
    expect(pendingPlanningAnswer("formats", [answer, reply, followup])).toBe(
      followup,
    );
    expect(pendingPlanningAnswer("unanswered", [answer])).toBeUndefined();
  });
});

describe("delivery evidence", () => {
  it("does not infer answer delivery from a cursor that may include skipped history", () => {
    const beforeQueue = planningInlineStatus(true, {
      ...delivery,
      state: "listening",
      queuedThrough: 0,
    });
    const laterQueue = planningInlineStatus(true, {
      ...delivery,
      queuedThrough: 6,
    });
    expect(beforeQueue).toEqual(laterQueue);
    expect(laterQueue.title).toBe("Waiting for a reply");
    expect(laterQueue.detail).toBe(
      "Your answer is saved. The companion is connected.",
    );
  });

  it("reports a companion delivery problem without claiming this answer failed", () => {
    const uncertain = { ...delivery, state: "uncertain" as const };
    expect(planningInlineStatus(true, uncertain).title).toBe(
      "Delivery needs checking",
    );
    expect(
      planningInlineStatus(true, { ...uncertain, connected: false }).title,
    ).toBe("Delivery needs checking");
  });

  it("distinguishes lost browser updates, missing metadata, and lost companion", () => {
    expect(planningInlineStatus(false, delivery).title).toBe(
      "Reconnecting to this plan",
    );
    expect(planningInlineStatus(true, undefined).detail).toContain(
      "Agent status is unknown",
    );
    const offline = planningInlineStatus(true, {
      ...delivery,
      connected: false,
    });
    expect(offline.title).toBe("Companion disconnected");
    expect(offline.detail).toBe(
      "Your answer is saved. Agent status is unknown.",
    );
    expect(offline.tone).toBe("warning");
  });
});
