import { expect, it } from "vite-plus/test";
import { questionAttention } from "../src/web/planning-attention.js";
import type { StoredPlanningEntry } from "../src/contract/planning.js";

const entry = (
  kind: StoredPlanningEntry["kind"],
  author: StoredPlanningEntry["author"] = "agent",
  replyTo = "q",
): StoredPlanningEntry => ({
  id: `${kind}-${author}`,
  section: "Scope",
  kind,
  author,
  replyTo,
  body: "Discussion",
  revision: 1,
  createdAt: "2026-09-11T00:00:00Z",
});

it("keeps saved answers waiting through notes and opens follow-ups separately", () => {
  const entries = [entry("answer", "human"), entry("note"), entry("question")];
  expect(questionAttention("q", entries)).toBe("waiting");
  expect(questionAttention("question-agent", entries)).toBe("open");
});
it("resolutions and explicit reopening preserve event order", () => {
  const entries = [entry("answer", "human"), entry("resolved"), entry("note")];
  expect(questionAttention("q", entries)).toBe("done");
  expect(questionAttention("q", [...entries, entry("reopened", "human")])).toBe(
    "open",
  );
  expect(
    questionAttention("q", [
      ...entries,
      entry("reopened", "human"),
      entry("answer", "human"),
    ]),
  ).toBe("waiting");
  expect(questionAttention("another-question", entries)).toBe("open");
});
