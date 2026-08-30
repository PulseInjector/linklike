import { useMemo } from "react";

import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { PlanGraph, Progress, ProgressStatus } from "@linklike/protocol";

import tokens from "../../../design/learning-map/tokens.json";
import { layoutLearningMap } from "./layout";
import { SectionNode, SubtopicNode, TopicNode } from "./MapNodes";

const nodeTypes = {
  topic: TopicNode,
  subtopic: SubtopicNode,
  section: SectionNode,
} satisfies NodeTypes;

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
  const laidOut = useMemo(() => layoutLearningMap(graph), [graph]);

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
      style: { width: section.width, height: section.height },
    }));

    const cards: Node[] = laidOut.nodes.map((node) => ({
      id: node.id,
      type: node.kind,
      position: node.position,
      data: {
        label: node.title,
        kind: node.kind,
        status: statusOf(progress, node.id),
      },
      selected: node.id === selectedId,
      width: node.width,
      height: node.height,
      style: { width: node.width, height: node.height },
    }));

    return [...frames, ...cards];
  }, [laidOut, progress, selectedId]);

  const edges = useMemo<Edge[]>(() => {
    const byId = Object.fromEntries(laidOut.nodes.map((node) => [node.id, node]));
    return graph.edges.map((edge, index) => {
      const target = byId[edge.to];
      const dashed = target?.kind === "subtopic";
      let sourceHandle = "source-bottom";
      let targetHandle = "target-top";
      if (target?.side === "left") {
        sourceHandle = "source-left";
        targetHandle = "target-right";
      } else if (target?.side === "right") {
        sourceHandle = "source-right";
        targetHandle = "target-left";
      }
      return {
        id: `${edge.from}->${edge.to}-${index}`,
        source: edge.from,
        target: edge.to,
        sourceHandle,
        targetHandle,
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

  const onNodeClick: NodeMouseHandler = (_event, node) => {
    if (node.type === "section") {
      return;
    }
    onSelect(node.id);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      elementsSelectable
      deleteKeyCode={null}
      fitView
      minZoom={0.15}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="var(--map-dot)" gap={22} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
