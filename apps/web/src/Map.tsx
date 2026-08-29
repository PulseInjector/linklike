import { useMemo } from "react";

import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { PlanGraph, Progress, ProgressStatus } from "@linklike/protocol";

import { layoutNodes, NODE_HEIGHT, NODE_WIDTH } from "./layout";

const STATUS_STYLE: Record<
  ProgressStatus | "none",
  { background: string; border: string; color: string }
> = {
  done: { background: "#166534", border: "#22c55e", color: "#dcfce7" },
  learning: { background: "#854d0e", border: "#f59e0b", color: "#fef3c7" },
  skip: { background: "#334155", border: "#64748b", color: "#cbd5e1" },
  none: { background: "#1e293b", border: "#475569", color: "#e2e8f0" },
};

function statusOf(progress: Progress, nodeId: string): ProgressStatus | "none" {
  return progress.entries[nodeId]?.status ?? "none";
}

export function Map({
  graph,
  progress,
  selectedId,
  onSelect,
}: {
  graph: PlanGraph;
  progress: Progress;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  const nodes = useMemo<Node[]>(() => {
    const raw: Node[] = graph.nodes.map((node) => {
      const status = statusOf(progress, node.id);
      const palette = STATUS_STYLE[status];
      return {
        id: node.id,
        position: { x: 0, y: 0 },
        data: { label: node.title },
        selected: node.id === selectedId,
        style: {
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          borderRadius: 10,
          background: palette.background,
          border: `2px solid ${node.id === selectedId ? "#a5b4fc" : palette.border}`,
          color: palette.color,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 12px",
          textAlign: "center",
        },
      };
    });
    const edges: Edge[] = graph.edges.map((edge, index) => ({
      id: `${edge.from}->${edge.to}-${index}`,
      source: edge.from,
      target: edge.to,
    }));
    return layoutNodes(raw, edges);
  }, [graph, progress, selectedId]);

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((edge, index) => ({
        id: `${edge.from}->${edge.to}-${index}`,
        source: edge.from,
        target: edge.to,
        style: { stroke: "#64748b" },
      })),
    [graph],
  );

  const onNodeClick: NodeMouseHandler = (_event, node) => {
    onSelect(node.id);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodeClick={onNodeClick}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      deleteKeyCode={null}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
