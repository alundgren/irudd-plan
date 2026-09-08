import { describe, expect, it } from "vite-plus/test";
import {
  implementationOrder,
  incidentEdges,
} from "../src/web/implementation-order.js";
import { tenItemPlan } from "./fixture.js";

function items(dependencies: readonly (readonly string[] | undefined)[]) {
  return dependencies.map((ids, index) => ({
    ...tenItemPlan().items[index % 10]!,
    id: String(index + 1),
    ...(ids === undefined ? {} : { dependsOnItemIds: ids }),
  }));
}

describe("implementation order", () => {
  it.each([
    {
      name: "chain",
      dependencies: [[], ["1"], ["2"]],
      levels: [["1"], ["2"], ["3"]],
    },
    {
      name: "diamond and fan-out/fan-in",
      dependencies: [[], ["1"], ["1"], ["3", "2"]],
      levels: [["1"], ["2", "3"], ["4"]],
    },
    {
      name: "disconnected items in plan order",
      dependencies: [["3"], [], [], ["2"]],
      levels: [
        ["2", "3"],
        ["1", "4"],
      ],
    },
    {
      name: "skipped levels",
      dependencies: [[], ["1"], ["2"], ["1", "3"]],
      levels: [["1"], ["2"], ["3"], ["4"]],
    },
    {
      name: "legacy and explicit empty",
      dependencies: [undefined, []],
      levels: [["1", "2"]],
    },
    { name: "one item", dependencies: [[]], levels: [["1"]] },
    { name: "empty plan", dependencies: [], levels: [] },
  ])(
    "calculates exact levels and direct edges for $name",
    ({ dependencies, levels }) => {
      const order = implementationOrder(items(dependencies));
      expect(order.levels.map((level) => level.map((item) => item.id))).toEqual(
        levels,
      );
      expect(order.edges).toEqual(
        dependencies.flatMap((ids, index) =>
          (ids ?? []).map((from) => ({ from, to: String(index + 1) })),
        ),
      );
    },
  );
  it("ignores related links and unrelated external state", () => {
    const order = implementationOrder(
      items([[], [], []]).map((item) => ({
        ...item,
        relatedItemIds: ["missing", "1"],
        completed: true,
        github: { state: "closed" },
      })),
    );
    expect(order.levels).toHaveLength(1);
    expect(order.edges).toEqual([]);
  });
  it("selects only direct incident edges, including skipped levels", () => {
    const order = implementationOrder(items([[], ["1"], ["2"], ["1", "3"]]));
    expect(incidentEdges(order)).toEqual([]);
    expect(incidentEdges(order, "1")).toEqual([
      { from: "1", to: "2" },
      { from: "1", to: "4" },
    ]);
    expect(incidentEdges(order, "3")).toEqual([
      { from: "2", to: "3" },
      { from: "3", to: "4" },
    ]);
  });
  it.each([[["1"]], [["2"], ["1"]], [["missing"]], [[], ["1", "1"]]])(
    "rejects invalid graphs %j",
    (...dependencies) => {
      expect(() => implementationOrder(items(dependencies))).toThrow();
    },
  );
  it("rejects unavailable lists and duplicate IDs", () => {
    expect(() =>
      implementationOrder(
        items([[]]).map((item) => ({
          ...item,
          dependsOnItemIds: null as never,
        })),
      ),
    ).toThrow(/unavailable or invalid/);
    expect(() =>
      implementationOrder([items([[]])[0]!, items([[]])[0]!]),
    ).toThrow(/duplicated/);
  });
  it("handles long chains without recursion and wide levels", () => {
    const chain = items(
      Array.from({ length: 10_000 }, (_, index) =>
        index === 0 ? [] : [String(index)],
      ),
    );
    expect(implementationOrder(chain).levels).toHaveLength(10_000);
    expect(
      implementationOrder(items(Array.from({ length: 1000 }, () => [])))
        .levels[0],
    ).toHaveLength(1000);
  });
});
