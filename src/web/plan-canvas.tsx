import { useEffect, useMemo, useRef } from "react";
import {
  Background,
  Controls,
  Handle,
  getViewportForBounds,
  MarkerType,
  Position,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  type Edge,
  type Node,
  type NodeProps,
  useReactFlow,
  useStore,
} from "@xyflow/react";

import { Compass } from "lucide-react";
import { Button } from "./ui/button.js";

import type { Plan, WorkItem } from "../contract/plan.js";
import {
  type FeedbackItem,
  type FeedbackTarget,
  targetStatus,
} from "./feedback.js";
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
  readonly focusedFeedback?: FeedbackItem;
  readonly onSelectFeedback: (item: FeedbackItem) => void;
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
  focusedFeedback,
  onSelectFeedback,
}: PlanCanvasProps) {
  const flow = useReactFlow<SheetNode, Edge>();
  const selectedNodeId = selectedItemId ?? "overview";
  const sheetWidth = useStore(
    (state) => state.nodeLookup.get(selectedNodeId)?.measured?.width,
  );
  const canvasWidth = useStore((state) => state.width);
  const sheetX = useStore(
    (state) => state.nodeLookup.get(selectedNodeId)?.position.x,
  );
  const previousSelection = useRef<
    { id: string; x: number; width: number; canvasWidth: number } | undefined
  >(undefined);
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
  useEffect(() => {
    if (
      sheetWidth === undefined ||
      sheetX === undefined ||
      !flow.viewportInitialized
    )
      return;
    const selected = flow.getInternalNode(selectedNodeId);
    if (selected === undefined || canvasWidth === 0) return;
    const previous = previousSelection.current;
    previousSelection.current = {
      id: selectedNodeId,
      x: sheetX,
      width: sheetWidth,
      canvasWidth,
    };
    if (previous?.id === selectedNodeId) {
      const viewport = flow.getViewport();
      void flow.setViewport({
        ...viewport,
        x:
          viewport.x +
          (canvasWidth - previous.canvasWidth) / 2 -
          ((sheetWidth - previous.width) / 2 + sheetX - previous.x) *
            viewport.zoom,
      });
      return;
    }
    const zoom = Math.min(1, (canvasWidth - 24) / sheetWidth);
    void flow.setViewport({
      x: (canvasWidth - sheetWidth * zoom) / 2 - selected.position.x * zoom,
      y: 58 - selected.position.y * zoom,
      zoom,
    });
  }, [canvasWidth, flow, sheetWidth, sheetX, selectedNodeId]);

  return (
    <ReactFlow<SheetNode, Edge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      minZoom={0.02}
      maxZoom={1.4}
      panOnScroll
      zoomOnDoubleClick={false}
      preventScrolling
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
      <Background color="var(--line)" gap={20} size={1.6} />
      <Controls
        showInteractive={false}
        showFitView={false}
        position="bottom-right"
      />
      <CanvasNavigation selectedNodeId={selectedNodeId} onSelect={onSelect} />
      <CanvasPins items={feedbackItems} onOpen={onSelectFeedback} />
      <FeedbackFocus
        plan={plan}
        selectedNodeId={selectedNodeId}
        {...(focusedFeedback === undefined ? {} : { item: focusedFeedback })}
      />
    </ReactFlow>
  );
}

function CanvasNavigation({
  selectedNodeId,
  onSelect,
}: {
  readonly selectedNodeId: string;
  readonly onSelect: (itemId?: string) => void;
}) {
  const flow = useReactFlow();
  const canvasWidth = useStore((state) => state.width);
  const canvasHeight = useStore((state) => state.height);
  return (
    <Panel position="top-left" className="canvas-navigation">
      {selectedNodeId === "overview" ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void flow.setViewport(
              getViewportForBounds(
                flow.getNodesBounds(flow.getNodes().map((node) => node.id)),
                canvasWidth,
                canvasHeight,
                0.02,
                1,
                0.12,
              ),
            )
          }
        >
          Fit all
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => onSelect()}>
          <Compass aria-hidden="true" size={14} /> Overview
        </Button>
      )}
    </Panel>
  );
}

function CanvasPins({
  items,
  onOpen,
}: {
  readonly items: ReadonlyArray<FeedbackItem>;
  readonly onOpen: (item: FeedbackItem) => void;
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
          onClick={() => onOpen(item)}
        >
          {number}
        </button>
      ))}
    </ViewportPortal>
  );
}

function FeedbackFocus({
  plan,
  selectedNodeId,
  item,
}: {
  readonly plan: Plan;
  readonly selectedNodeId: string;
  readonly item?: FeedbackItem;
}) {
  const flow = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const applied = useRef<FeedbackItem | undefined>(undefined);
  useEffect(() => {
    if (item === undefined || applied.current === item || width === 0) return;
    if (targetStatus(item, plan) === "missing") {
      applied.current = item;
      return;
    }
    const target = item.target;
    if (
      target.kind !== "canvas" &&
      selectedNodeId !== (target.itemId ?? "overview")
    )
      return;
    const frame = requestAnimationFrame(() => {
      const viewport = flow.getViewport();
      if (target.kind === "canvas") {
        void flow.setViewport({
          ...viewport,
          x: width / 2 - target.x * viewport.zoom,
          y: Math.min(200, height / 2) - target.y * viewport.zoom,
        });
      } else {
        const sheet = document.querySelector<HTMLElement>(
          ".plan-sheet.selected",
        );
        const attribute =
          target.kind === "asset" ? "data-feedback-asset" : "data-section";
        const value =
          target.kind === "asset"
            ? target.assetId
            : target.sectionId === "header" || target.itemId === undefined
              ? target.sectionId
              : `${target.itemId}:${target.sectionId}`;
        const element = Array.from(
          sheet?.querySelectorAll<HTMLElement>(`[${attribute}]`) ?? [],
        ).find((candidate) => candidate.getAttribute(attribute) === value);
        if (element === undefined || sheet === null) return;
        const zoom = Math.min(1, (width - 24) / sheet.offsetWidth);
        const bounds = element.getBoundingClientRect();
        const point = flow.screenToFlowPosition({
          x: bounds.left,
          y: bounds.top,
        });
        void flow.setViewport({
          ...viewport,
          x:
            (width - (bounds.width / viewport.zoom) * zoom) / 2 -
            point.x * zoom,
          y: 100 - point.y * zoom,
          zoom,
        });
      }
      applied.current = item;
    });
    return () => cancelAnimationFrame(frame);
  }, [flow, height, item, plan, selectedNodeId, width]);
  return null;
}

function SheetNodeView({ data }: NodeProps<SheetNode>) {
  const flow = useReactFlow();
  const container = useRef<HTMLDivElement>(null);
  const touch = useRef<
    | { x: number; y: number; viewport: ReturnType<typeof flow.getViewport> }
    | undefined
  >(undefined);
  useEffect(() => {
    const sheet = container.current?.querySelector<HTMLElement>(".plan-sheet");
    const stopPanning = () => {
      touch.current = undefined;
    };
    const pan = (event: TouchEvent) => {
      const start = touch.current;
      const point = event.touches[0];
      if (
        event.touches.length !== 1 ||
        window.getSelection()?.isCollapsed === false
      )
        touch.current = undefined;
      if (
        touch.current === undefined ||
        start === undefined ||
        point === undefined
      )
        return;
      event.preventDefault();
      void flow.setViewport({
        ...start.viewport,
        x: start.viewport.x + point.clientX - start.x,
        y: start.viewport.y + point.clientY - start.y,
      });
    };
    sheet?.addEventListener("selectstart", stopPanning);
    sheet?.addEventListener("touchmove", pan, { passive: false });
    return () => {
      sheet?.removeEventListener("selectstart", stopPanning);
      sheet?.removeEventListener("touchmove", pan);
    };
  }, [flow]);
  return (
    <div
      ref={container}
      onTouchStart={(event) => {
        const point = event.touches[0];
        touch.current =
          event.touches.length === 1 &&
          point !== undefined &&
          !(event.target as Element).closest(
            "button, a, input, textarea, select, iframe",
          )
            ? {
                x: point.clientX,
                y: point.clientY,
                viewport: flow.getViewport(),
              }
            : undefined;
      }}
      onTouchEnd={() => {
        touch.current = undefined;
      }}
      onTouchCancel={() => {
        touch.current = undefined;
      }}
    >
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
    </div>
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
      data: { ...common, selected: selectedItemId === undefined },
      zIndex: selectedItemId === undefined ? 10 : 1,
    },
    ...plan.items.map((item, index) => {
      return {
        id: item.id,
        type: "sheet" as const,
        position: { x: (index + 1) * 672, y: 0 },
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
    style: { stroke: "#C1AF9A", strokeWidth: 1.5 },
  }));
  return overviewEdges;
}
