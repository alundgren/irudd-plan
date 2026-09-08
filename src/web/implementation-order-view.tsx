import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Plan, WorkItem } from "../contract/plan.js";
import {
  implementationOrder,
  incidentEdges,
  type DependencyEdge,
} from "./implementation-order.js";
import { Button } from "./ui/button.js";

export function ImplementationOrderView({
  plan,
  active,
  error,
  onOpen,
}: {
  readonly plan: Plan;
  readonly active: boolean;
  readonly error?: string;
  readonly onOpen: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string>();
  const graph = useMemo(() => {
    try {
      return { order: implementationOrder(plan.items) };
    } catch (caught) {
      return {
        error:
          caught instanceof Error
            ? caught.message
            : "Dependency data is invalid.",
      };
    }
  }, [plan.items]);
  const item = plan.items.find((candidate) => candidate.id === selected);
  const removed = selected !== undefined && item === undefined;
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (active) heading.current?.focus({ preventScroll: true });
  }, [active]);
  const edges = graph.order ? incidentEdges(graph.order, item?.id) : [];
  const prerequisites = plan.items.filter((candidate) =>
    edges.some((edge) => edge.from === candidate.id && edge.to === item?.id),
  );
  const dependents = plan.items.filter((candidate) =>
    edges.some((edge) => edge.to === candidate.id && edge.from === item?.id),
  );
  const failure = error ?? graph.error;
  return (
    <section
      className="implementation-order"
      aria-label="Implementation order"
      hidden={!active}
    >
      <div className="order-introduction">
        <h1 ref={heading} tabIndex={-1}>
          Implementation order
        </h1>
        <p>
          Steps group declared prerequisites. Items in the same step have no
          declared dependency on one another and may be implemented in parallel.
          Steps do not track work started or finished.
        </p>
      </div>
      {failure && (
        <p className="order-notice" role="alert">
          Implementation order unavailable. {failure}
        </p>
      )}
      {graph.order && (
        <div hidden={Boolean(failure)}>
          {removed && (
            <p className="order-notice" role="status">
              The selected item was removed. Select another item to inspect its
              relationships.
            </p>
          )}
          {plan.items.length === 0 ? (
            <p className="order-notice">
              No work items yet. Implementation steps will appear when items are
              added to this plan.
            </p>
          ) : (
            <>
              <div
                className="order-relationships"
                aria-label="Selected item relationships"
              >
                {item ? (
                  <>
                    <div className="order-selection">
                      <h2>{item.title}</h2>
                      <Button variant="outline" onClick={() => onOpen(item.id)}>
                        Open item
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setSelected(undefined)}
                      >
                        Clear selection
                      </Button>
                    </div>
                    <div className="order-relationship-lists">
                      <RelationshipList
                        title="Prerequisites"
                        items={prerequisites}
                        onSelect={setSelected}
                      />
                      <RelationshipList
                        title="Dependents"
                        items={dependents}
                        onSelect={setSelected}
                      />
                    </div>
                  </>
                ) : (
                  <p>
                    Select an item to inspect its direct prerequisites and
                    dependents.
                  </p>
                )}
              </div>
              <OrderGraph
                levels={graph.order.levels}
                edges={edges}
                selected={item?.id}
                active={active && !failure}
                onSelect={setSelected}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function RelationshipList({
  title,
  items,
  onSelect,
}: {
  readonly title: string;
  readonly items: ReadonlyArray<WorkItem>;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <section>
      <h3>
        {title} ({items.length})
      </h3>
      <ul aria-label={title} tabIndex={items.length ? 0 : undefined}>
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => onSelect(item.id)}>
              {item.title}
            </button>
          </li>
        ))}
        {items.length === 0 && <li>None declared</li>}
      </ul>
    </section>
  );
}

function OrderGraph({
  levels,
  edges,
  selected,
  active,
  onSelect,
}: {
  readonly levels: ReadonlyArray<ReadonlyArray<WorkItem>>;
  readonly edges: ReadonlyArray<DependencyEdge>;
  readonly selected: string | undefined;
  readonly active: boolean;
  readonly onSelect: (id: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<ReadonlyArray<string>>([]);
  useLayoutEffect(() => {
    if (!active || !root.current) return;
    const element = root.current;
    const measure = () => {
      const origin = element.getBoundingClientRect();
      const nodes = new Map(
        Array.from(
          element.querySelectorAll<HTMLElement>("[data-order-item]"),
        ).map((node) => [node.dataset.orderItem, node.getBoundingClientRect()]),
      );
      setPaths(
        edges.map((edge, index) => {
          const from = nodes.get(edge.from),
            to = nodes.get(edge.to);
          if (!from || !to) return "";
          const x1 = from.right - origin.left,
            y1 = from.top + from.height / 2 - origin.top;
          const x2 = to.left - origin.left,
            y2 = to.top + to.height / 2 - origin.top;
          const lane = 12 + (index % 8) * 8;
          return `M ${x1} ${y1} H ${x1 + 18} V ${lane} H ${x2 - 18} V ${y2} H ${x2 - 3}`;
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element
      .querySelectorAll("[data-order-item]")
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [levels, edges, active]);
  return (
    <div
      className="order-graph-scroll"
      tabIndex={0}
      aria-label="Implementation steps"
    >
      <div className="order-graph" ref={root}>
        <svg className="order-arrows" aria-hidden="true">
          <defs>
            <marker
              id="order-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" />
            </marker>
          </defs>
          {edges.map((edge, index) => (
            <path
              key={JSON.stringify(edge)}
              data-from={edge.from}
              data-to={edge.to}
              d={paths[index] ?? ""}
              markerEnd="url(#order-arrow)"
            />
          ))}
        </svg>
        {levels.map((items, index) => (
          <section
            className="order-step"
            key={index}
            aria-label={`Step ${index + 1}`}
          >
            <h2>Step {index + 1}</h2>
            {items.map((item) => {
              const relation =
                item.id === selected
                  ? "selected"
                  : edges.some((edge) => edge.from === item.id)
                    ? "prerequisite"
                    : edges.some((edge) => edge.to === item.id)
                      ? "dependent"
                      : "";
              return (
                <button
                  type="button"
                  className={`order-item ${relation}`}
                  key={item.id}
                  data-order-item={item.id}
                  aria-pressed={item.id === selected}
                  onClick={() => onSelect(item.id)}
                >
                  <span>{item.title}</span>
                  <small>
                    {item.dependsOnItemIds?.length ?? 0} prerequisites
                    {relation ? ` · ${relation}` : ""}
                  </small>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
