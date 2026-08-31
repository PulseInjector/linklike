import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  Background,
  Controls,
  PanOnScrollMode,
  ReactFlow,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  subtreeNodeIds,
  type PlanGraph,
  type Progress,
  type ProgressStatus,
} from "@linklike/protocol";

import tokens from "../../../design/learning-map/tokens.json";
import { edgeHandles, layoutLearningMap } from "./layout";
import { CardNode, SectionNode } from "./MapNodes";
import { MAX_ZOOM, MIN_ZOOM, openingViewport } from "./viewport";

const nodeTypes = {
  topic: CardNode,
  subtopic: CardNode,
  section: SectionNode,
} satisfies NodeTypes;

function statusOf(progress: Progress, nodeId: string): ProgressStatus | "none" {
  return progress.entries[nodeId]?.status ?? "none";
}

function OpeningView({ graphId }: { graphId: string }) {
  const { getNodesBounds, setViewport } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const nodes = useStore((state) => state.nodes);
  const ready = useNodesInitialized();
  const applied = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!ready || width < 1 || height < 1) {
      return;
    }
    if (applied.current === graphId) {
      return;
    }
    const cards = nodes.filter((node) => node.type !== "section");
    if (cards.length === 0) {
      return;
    }
    setViewport(openingViewport(getNodesBounds(cards), { width, height }));
    applied.current = graphId;
  }, [graphId, ready, width, height, nodes, getNodesBounds, setViewport]);

  return null;
}

export function Map({
  graph,
  progress,
  selectedId,
  onSelect,
  onOpenNotes,
  onAdd,
  onDelete,
}: {
  graph: PlanGraph;
  progress: Progress;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
  onOpenNotes: (nodeId: string) => void;
  onAdd: (parentId: string, title: string) => Promise<void>;
  onDelete: (nodeId: string) => Promise<void>;
}) {
  const laidOut = useMemo(() => layoutLearningMap(graph), [graph]);
  const graphId = useMemo(() => graph.nodes.map((node) => node.id).join("\0"), [graph]);
  const [addingForId, setAddingForId] = useState<string | null>(null);
  const committingAdd = useRef(false);
  const pendingClick = useRef<{
    id: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (pendingClick.current) {
        clearTimeout(pendingClick.current.timer);
      }
    };
  }, []);

  useEffect(() => {
    if (addingForId && addingForId !== selectedId) {
      setAddingForId(null);
    }
  }, [selectedId, addingForId]);

  const cancelAdd = () => {
    setAddingForId(null);
  };

  const commitAdd = async (parentId: string, rawTitle: string) => {
    if (committingAdd.current) {
      return;
    }
    const title = rawTitle.trim();
    if (!title) {
      cancelAdd();
      return;
    }
    committingAdd.current = true;
    try {
      await onAdd(parentId, title);
      cancelAdd();
    } finally {
      committingAdd.current = false;
    }
  };

  const requestDelete = async (nodeId: string) => {
    const hasChildren = graph.edges.some((edge) => edge.from === nodeId);
    if (hasChildren && !window.confirm("Delete this node and its children?")) {
      return;
    }
    await onDelete(nodeId);
  };

  const nodes = useMemo<Node[]>(() => {
    const frames: Node[] = laidOut.sections.map((section) => ({
      id: section.id,
      type: "section",
      position: section.position,
      data: {},
      selectable: false,
      focusable: false,
      draggable: false,
      connectable: false,
      zIndex: -1,
      width: section.width,
      height: section.height,
      style: {
        width: section.width,
        height: section.height,
        pointerEvents: "none",
      },
    }));

    const cards: Node[] = laidOut.nodes.map((node) => ({
      id: node.id,
      type: node.kind,
      position: node.position,
      data: {
        label: node.title,
        kind: node.kind,
        status: statusOf(progress, node.id),
        canDelete: subtreeNodeIds(graph, node.id).size < graph.nodes.length,
        adding: addingForId === node.id,
        onAdd: () => {
          setAddingForId(node.id);
        },
        onDelete: () => {
          void requestDelete(node.id).catch(() => undefined);
        },
        onCommitAdd: (title: string) => {
          void commitAdd(node.id, title).catch(() => undefined);
        },
        onCancelAdd: cancelAdd,
        onOpenNotes: () => onOpenNotes(node.id),
      },
      selected: node.id === selectedId,
      width: node.width,
      height: node.height,
      style: { width: node.width, height: node.height },
    }));

    return [...frames, ...cards];
  }, [laidOut, progress, selectedId, addingForId, onAdd, onDelete, onOpenNotes, graph]);

  const edges = useMemo<Edge[]>(() => {
    // This file's Map component shadows the constructor; Map.get skips prototype keys.
    const byId = new globalThis.Map(
      laidOut.nodes.map((node) => [node.id, node] as const),
    );
    return graph.edges.map((edge, index) => {
      const source = byId.get(edge.from);
      const target = byId.get(edge.to);
      const dashed = target?.kind === "subtopic";
      const handles =
        source && target
          ? edgeHandles(source, target)
          : { sourceHandle: "source-bottom", targetHandle: "target-top" };
      return {
        id: `${edge.from}->${edge.to}-${index}`,
        source: edge.from,
        target: edge.to,
        sourceHandle: handles.sourceHandle,
        targetHandle: handles.targetHandle,
        type: "smoothstep",
        style: {
          stroke: tokens.edge.stroke,
          strokeWidth: tokens.edge.strokeWidth,
          strokeLinecap: "round",
          ...(dashed ? { strokeDasharray: tokens.edge.dashedDasharray } : {}),
        },
      };
    });
  }, [graph, laidOut]);

  const onNodeClick: NodeMouseHandler = (event, node) => {
    if (node.type === "section") {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest(".map-node-toolbar")) {
      if (pendingClick.current) {
        clearTimeout(pendingClick.current.timer);
        pendingClick.current = null;
      }
      return;
    }

    onSelect(node.id);
    if (event.detail >= 2) {
      if (pendingClick.current) {
        clearTimeout(pendingClick.current.timer);
        pendingClick.current = null;
      }
      onOpenNotes(node.id);
      return;
    }
    if (pendingClick.current?.id === node.id) {
      clearTimeout(pendingClick.current.timer);
      pendingClick.current = null;
      onOpenNotes(node.id);
      return;
    }
    if (pendingClick.current) {
      clearTimeout(pendingClick.current.timer);
    }
    pendingClick.current = {
      id: node.id,
      timer: setTimeout(() => {
        pendingClick.current = null;
      }, 280),
    };
  };

  const onNodeDoubleClick: NodeMouseHandler = (event, node) => {
    if (node.type === "section") {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest(".map-node-toolbar")) {
      return;
    }
    if (pendingClick.current) {
      clearTimeout(pendingClick.current.timer);
      pendingClick.current = null;
    }
    onOpenNotes(node.id);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onNodeDoubleClick={onNodeDoubleClick}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      elementsSelectable
      deleteKeyCode={null}
      panActivationKeyCode={addingForId ? null : "Space"}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      panOnScroll
      panOnScrollMode={PanOnScrollMode.Free}
      zoomOnScroll={false}
      fitViewOptions={{ padding: 0.15, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM }}
      proOptions={{ hideAttribution: true }}
    >
      <OpeningView graphId={graphId} />
      <Background color="var(--map-dot)" gap={22} size={1} />
      <Controls
        showInteractive={false}
        fitViewOptions={{ padding: 0.15, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM }}
      />
    </ReactFlow>
  );
}
