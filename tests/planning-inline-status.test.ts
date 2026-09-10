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
  it("compares coverage with this answer, including listening heartbeats", () => {
    expect(planningInlineStatus(4, true, delivery).title).toBe(
      "Queued for the agent",
    );
    expect(planningInlineStatus(5, true, delivery).title).toBe(
      "Waiting to send to the agent",
    );
    expect(
      planningInlineStatus(4, true, { ...delivery, state: "listening" }).title,
    ).toBe("Queued for the agent");
  });

  it("does not confuse a failed later batch with an already queued answer", () => {
    const uncertain = { ...delivery, state: "uncertain" as const };
    expect(planningInlineStatus(4, true, uncertain).title).toBe(
      "Queued for the agent",
    );
    expect(planningInlineStatus(5, true, uncertain).title).toBe(
      "Delivery needs checking",
    );
    expect(
      planningInlineStatus(5, true, { ...uncertain, connected: false }).title,
    ).toBe("Delivery needs checking");
  });

  it("distinguishes lost browser updates, missing metadata, and lost companion", () => {
    expect(planningInlineStatus(4, false, delivery).title).toBe(
      "Reconnecting to this plan",
    );
    expect(planningInlineStatus(4, true, undefined).title).toBe(
      "Waiting for a reply",
    );
    const offline = { ...delivery, connected: false };
    expect(planningInlineStatus(4, true, offline).detail).toContain(
      "was queued",
    );
    expect(planningInlineStatus(5, true, offline).detail).toContain(
      "Delivery will continue",
    );
    expect(planningInlineStatus(4, true, offline).tone).toBe("warning");
  });
});
