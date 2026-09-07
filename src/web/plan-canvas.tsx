import { CanvasComments, type CanvasTool } from "./canvas-comments.js";
import { CanvasTools } from "./canvas-tools.js";
import { feedbackElement, FeedbackPins } from "./feedback-pins.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Handle,
  MarkerType,
  Position,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  useReactFlow,
  useStore,
} from "@xyflow/react";

import { Compass } from "lucide-react";
import { Button } from "./ui/button.js";

import type { AssetDescriptor, Plan, WorkItem } from "../contract/plan.js";
import {
  type FeedbackItem,
  type FeedbackTarget,
  targetStatus,
} from "./feedback.js";
import { PlanSheet } from "./plan-sheet.js";
import { collectRequiredContent } from "./required-content.js";
import { ReferenceSheet, sheetNodeId } from "./reference-sheet.js";

interface PlanCanvasProps {
  readonly plan: Plan;
  readonly selectedItemId?: string;
  readonly changedSections: ReadonlySet<string>;
  readonly feedbackItems: ReadonlyArray<FeedbackItem>;
  readonly onSelect: (itemId?: string) => void;
  readonly onAddFeedback: (target: FeedbackTarget) => void;
  readonly focusedFeedback?: FeedbackItem;
  readonly selectedFeedbackId?: string;
  readonly onSelectFeedback: (item: FeedbackItem) => void;
}

interface SheetNodeData extends Record<string, unknown> {
  readonly plan: Plan;
  readonly item?: WorkItem;
  readonly asset?: AssetDescriptor;
  readonly onReference: (itemId: string, assetId: string) => void;
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
  onSelect,
  onAddFeedback,
  focusedFeedback,
  selectedFeedbackId,
  onSelectFeedback,
}: PlanCanvasProps) {
  const flow = useReactFlow<SheetNode, Edge>();
  const [tool, setTool] = useState<CanvasTool>("comment");
  const [focusRequest, setFocusRequest] = useState(0);
  const [reference, setReference] = useState<{
    itemId: string;
    assetId: string;
  }>();
  const activeReference =
    reference !== undefined &&
    reference.itemId === selectedItemId &&
    plan.items.some(
      (item) =>
        item.id === reference.itemId &&
        collectRequiredContent(plan, item).assets.some(
          (asset) => asset.id === reference.assetId,
        ),
    )
      ? reference
      : undefined;
  useEffect(() => {
    if (activeReference === undefined)
      setReference((current) => (current === reference ? undefined : current));
  }, [activeReference, reference]);
  const selectItem = useCallback(
    (itemId?: string) => {
      setReference(undefined);
      setFocusRequest((request) => request + 1);
      if (itemId !== selectedItemId) onSelect(itemId);
    },
    [onSelect, selectedItemId],
  );
  const selectReference = useCallback(
    (itemId: string, assetId: string) => {
      setReference({ itemId, assetId });
      setFocusRequest((request) => request + 1);
      if (itemId !== selectedItemId) onSelect(itemId);
    },
    [onSelect, selectedItemId],
  );
  const selectedNodeId = sheetNodeId(selectedItemId, activeReference?.assetId);
  const sheetWidth = useStore(
    (state) => state.nodeLookup.get(selectedNodeId)?.measured?.width,
  );
  const canvasWidth = useStore((state) => state.width);
  const sheetX = useStore(
    (state) => state.nodeLookup.get(selectedNodeId)?.position.x,
  );
  const previousSelection = useRef<
    | {
        id: string;
        x: number;
        width: number;
        canvasWidth: number;
        request: number;
      }
    | undefined
  >(undefined);
  const nodes = useMemo(
    () =>
      makeNodes(
        plan,
        selectedNodeId,
        changedSections,
        feedbackItems,
        selectItem,
        onAddFeedback,
        selectReference,
      ),
    [
      changedSections,
      feedbackItems,
      onAddFeedback,
      selectItem,
      selectReference,
      plan,
      selectedNodeId,
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
      request: focusRequest,
    };
    if (previous?.id === selectedNodeId && previous.request === focusRequest) {
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
  }, [canvasWidth, flow, sheetWidth, sheetX, selectedNodeId, focusRequest]);

  return (
    <CanvasComments
      plan={plan}
      tool={tool}
      onTool={setTool}
      onAdd={onAddFeedback}
    >
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
        panOnDrag={false}
        proOptions={{ hideAttribution: true }}
        aria-label="Plan canvas"
      >
        <Background color="var(--line)" gap={20} size={1.6} />
        <CanvasNavigation
          selectedNodeId={selectedNodeId}
          onSelect={selectItem}
        />
        <CanvasTools
          tool={tool}
          onTool={setTool}
          onAddCanvas={(point) => onAddFeedback({ kind: "canvas", ...point })}
        />
        <FeedbackPins
          plan={plan}
          items={feedbackItems}
          {...(selectedFeedbackId === undefined
            ? {}
            : { selectedId: selectedFeedbackId })}
          onOpen={onSelectFeedback}
        />
        <FeedbackFocus
          plan={plan}
          selectedNodeId={selectedNodeId}
          {...(sheetWidth === undefined ? {} : { sheetWidth })}
          onSelect={selectItem}
          onReference={selectReference}
          {...(focusedFeedback === undefined ? {} : { item: focusedFeedback })}
        />
      </ReactFlow>
    </CanvasComments>
  );
}

function CanvasNavigation({
  selectedNodeId,
  onSelect,
}: {
  readonly selectedNodeId: string;
  readonly onSelect: (itemId?: string) => void;
}) {
  return selectedNodeId === sheetNodeId() ? null : (
    <Panel position="top-left" className="canvas-navigation">
      <Button variant="outline" size="sm" onClick={() => onSelect()}>
        <Compass aria-hidden="true" size={14} /> Overview
      </Button>
    </Panel>
  );
}

function FeedbackFocus({
  plan,
  selectedNodeId,
  sheetWidth,
  item,
  onSelect,
  onReference,
}: {
  readonly plan: Plan;
  readonly selectedNodeId: string;
  readonly sheetWidth?: number;
  readonly item?: FeedbackItem;
  readonly onSelect: (itemId?: string) => void;
  readonly onReference: (itemId: string, assetId: string) => void;
}) {
  const flow = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const applied = useRef<FeedbackItem | undefined>(undefined);
  useEffect(() => {
    if (item === undefined || applied.current === item || width === 0) return;
    if (targetStatus(item, plan) !== "current") {
      applied.current = item;
      return;
    }
    const target = item.target;
    if (
      target.kind !== "canvas" &&
      selectedNodeId !==
        sheetNodeId(
          target.itemId,
          target.kind === "asset" ? target.assetId : undefined,
        )
    ) {
      if (target.kind === "asset") onReference(target.itemId, target.assetId);
      else onSelect(target.itemId);
      return;
    }
    // Let the selected sheet finish its initial centering before focusing a note.
    if (sheetWidth === undefined) return;
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
        const element = feedbackElement(target);
        if (element === undefined || sheet === null) return;
        const zoom = Math.min(1, (width - 24) / sheet.offsetWidth);
        const bounds = element.getBoundingClientRect();
        const point = flow.screenToFlowPosition({
          x: bounds.left + bounds.width * (target.position?.x ?? 0),
          y: bounds.top + bounds.height * (target.position?.y ?? 0),
        });
        void flow.setViewport({
          ...viewport,
          x:
            (target.position === undefined
              ? (width - (bounds.width / viewport.zoom) * zoom) / 2
              : width / 2) -
            point.x * zoom,
          y: 100 - point.y * zoom,
          zoom,
        });
      }
      applied.current = item;
    });
    return () => cancelAnimationFrame(frame);
  }, [
    flow,
    height,
    item,
    plan,
    selectedNodeId,
    sheetWidth,
    width,
    onSelect,
    onReference,
  ]);
  return null;
}

function SheetNodeView({ data }: NodeProps<SheetNode>) {
  return (
    <div>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{ opacity: 0, pointerEvents: "none" }}
      />
      {data.asset !== undefined && data.item !== undefined ? (
        <ReferenceSheet
          planId={data.plan.planId}
          item={data.item}
          asset={data.asset}
          selected={data.selected}
          changed={data.changedSections.has(
            sheetNodeId(data.item.id, data.asset.id),
          )}
          feedbackItems={data.feedbackItems}
          onReturn={() => data.onSelect(data.item?.id)}
          onAddFeedback={data.onAddFeedback}
        />
      ) : (
        <PlanSheet {...data} />
      )}
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
  selectedNodeId: string,
  changedSections: ReadonlySet<string>,
  feedbackItems: ReadonlyArray<FeedbackItem>,
  onSelect: (itemId?: string) => void,
  onAddFeedback: (target: FeedbackTarget) => void,
  onReference: (itemId: string, assetId: string) => void,
): SheetNode[] {
  const common = {
    plan,
    changedSections,
    feedbackItems,
    onSelect,
    onAddFeedback,
    onReference,
  };
  const sheets: Array<{
    id: string;
    item?: WorkItem;
    asset?: AssetDescriptor;
  }> = [
    { id: sheetNodeId() },
    ...plan.items.flatMap((item) => [
      { id: sheetNodeId(item.id), item },
      ...collectRequiredContent(plan, item).assets.map((asset) => ({
        id: sheetNodeId(item.id, asset.id),
        item,
        asset,
      })),
    ]),
  ];
  return sheets.map(({ id, ...content }, index) => ({
    id,
    type: "sheet",
    position: { x: index * 672, y: 0 },
    data: { ...common, ...content, selected: id === selectedNodeId },
    zIndex: id === selectedNodeId ? 10 : 1,
  }));
}

function makeEdges(plan: Plan): Edge[] {
  const overviewEdges = plan.items.map((item) => ({
    id: `overview-${item.id}`,
    source: sheetNodeId(),
    target: sheetNodeId(item.id),
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "#C1AF9A", strokeWidth: 1.5 },
  }));
  return overviewEdges;
}
