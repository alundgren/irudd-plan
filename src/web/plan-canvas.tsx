import { useEffect, useMemo, useRef } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  type Edge,
  type Node,
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";

import type { Plan, WorkItem } from "../contract/plan.js";
import type { FeedbackItem, FeedbackTarget } from "./feedback.js";
import { PlanSheet } from "./plan-sheet.js";

interface PlanCanvasProps {
  readonly plan: Plan;
  readonly selectedItemId?: string;
  readonly changedSections: ReadonlySet<string>;
  readonly feedbackItems: ReadonlyArray<FeedbackItem>;
  readonly pinningCanvas: boolean;
  readonly onSelect: (itemId?: string) => void;
  readonly onAddFeedback: (target: FeedbackTarget) => void;
  readonly onCanvasPin: (location: {
    readonly x: number;
    readonly y: number;
  }) => void;
  readonly onOpenFeedback: () => void;
}

interface SheetNodeData extends Record<string, unknown> {
  readonly plan: Plan;
  readonly item?: WorkItem;
  readonly selected: boolean;
  readonly changedSections: ReadonlySet<string>;
  readonly feedbackItems: ReadonlyArray<FeedbackItem>;
  readonly onSelect: (itemId?: string) => void;
  readonly onAddFeedback: (target: FeedbackTarget) => void;
}

type SheetNode = Node<SheetNodeData, "sheet">;

const nodeTypes = { sheet: SheetNodeView };

export function PlanCanvas(props: PlanCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasContents {...props} />
    </ReactFlowProvider>
  );
}

function CanvasContents({
  plan,
  selectedItemId,
  changedSections,
  feedbackItems,
  pinningCanvas,
  onSelect,
  onAddFeedback,
  onCanvasPin,
  onOpenFeedback,
}: PlanCanvasProps) {
  const flow = useReactFlow<SheetNode, Edge>();
  const previousSelection = useRef<string | undefined>(undefined);
  const nodes = useMemo(
    () =>
      makeNodes(
        plan,
        selectedItemId,
        changedSections,
        feedbackItems,
        onSelect,
        onAddFeedback,
      ),
    [
      changedSections,
      feedbackItems,
      onAddFeedback,
      onSelect,
      plan,
      selectedItemId,
    ],
  );
  const edges = useMemo(() => makeEdges(plan), [plan]);
  const selectedNodeId = selectedItemId ?? "overview";

  useEffect(() => {
    if (previousSelection.current === selectedNodeId) return;
    previousSelection.current = selectedNodeId;
    const selected = nodes.find((node) => node.id === selectedNodeId);
    if (selected !== undefined) {
      void flow.fitView({
        nodes: [selected],
        duration: 380,
        maxZoom: 0.92,
        padding: 0.12,
      });
    }
  }, [flow, nodes, selectedNodeId]);

  return (
    <ReactFlow<SheetNode, Edge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      minZoom={0.2}
      maxZoom={1.4}
      panOnScroll
      zoomOnDoubleClick={false}
      preventScrolling={false}
      panOnDrag={!pinningCanvas}
      onPaneClick={(event) => {
        if (!pinningCanvas) return;
        onCanvasPin(
          flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        );
      }}
      proOptions={{ hideAttribution: true }}
      aria-label="Plan canvas"
      className={pinningCanvas ? "pinning-feedback" : ""}
    >
      <Background color="#cbd5e1" gap={24} size={1} />
      <Controls showInteractive={false} position="bottom-right" />
      <CanvasPins items={feedbackItems} onOpen={onOpenFeedback} />
    </ReactFlow>
  );
}

function CanvasPins({
  items,
  onOpen,
}: {
  readonly items: ReadonlyArray<FeedbackItem>;
  readonly onOpen: () => void;
}) {
  const canvasItems = items
    .map((item, index) => ({ item, number: index + 1 }))
    .filter(
      (
        entry,
      ): entry is {
        item: FeedbackItem & {
          target: { kind: "canvas"; x: number; y: number };
        };
        number: number;
      } => entry.item.target.kind === "canvas",
    );
  return (
    <ViewportPortal>
      {canvasItems.map(({ item, number }) => (
        <button
          type="button"
          className="canvas-feedback-pin nodrag nopan"
          style={{
            transform: `translate(${item.target.x}px, ${item.target.y}px)`,
          }}
          aria-label={`Open canvas feedback ${number}`}
          key={item.id}
          onClick={onOpen}
        >
          {number}
        </button>
      ))}
    </ViewportPortal>
  );
}

function SheetNodeView({ data }: NodeProps<SheetNode>) {
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{ opacity: 0, pointerEvents: "none" }}
      />
      <PlanSheet {...data} />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{ opacity: 0, pointerEvents: "none" }}
      />
    </>
  );
}

function makeNodes(
  plan: Plan,
  selectedItemId: string | undefined,
  changedSections: ReadonlySet<string>,
  feedbackItems: ReadonlyArray<FeedbackItem>,
  onSelect: (itemId?: string) => void,
  onAddFeedback: (target: FeedbackTarget) => void,
): SheetNode[] {
  const common = {
    plan,
    changedSections,
    feedbackItems,
    onSelect,
    onAddFeedback,
  };
  return [
    {
      id: "overview",
      type: "sheet",
      position: { x: 0, y: 0 },
      style: { height: 610 },
      data: { ...common, selected: selectedItemId === undefined },
      zIndex: selectedItemId === undefined ? 10 : 1,
    },
    ...plan.items.map((item, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      return {
        id: item.id,
        type: "sheet" as const,
        position: { x: 620 + column * 520, y: row * 660 },
        style: { height: 610 },
        data: {
          ...common,
          item,
          selected: selectedItemId === item.id,
        },
        zIndex: selectedItemId === item.id ? 10 : 1,
      };
    }),
  ];
}

function makeEdges(plan: Plan): Edge[] {
  const overviewEdges = plan.items.map((item) => ({
    id: `overview-${item.id}`,
    source: "overview",
    target: item.id,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "#94a3b8", strokeWidth: 1.5 },
  }));
  const relatedEdges = plan.items.flatMap((item) =>
    item.relatedItemIds.map((target) => ({
      id: `${item.id}-${target}`,
      source: item.id,
      target,
      type: "smoothstep",
      style: { stroke: "#22a5a1", strokeDasharray: "5 5" },
    })),
  );
  return [...overviewEdges, ...relatedEdges];
}
