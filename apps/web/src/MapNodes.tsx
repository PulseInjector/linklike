import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

export type MapNodeData = {
  label: string;
  kind: "topic" | "subtopic";
  status: "none" | "learning" | "done" | "skip";
};

export type CardFlowNode = Node<MapNodeData, "topic" | "subtopic">;
export type SectionFlowNode = Node<Record<string, never>, "section">;

function cardClass(data: MapNodeData, selected: boolean): string {
  const status = data.status === "none" ? "" : ` is-${data.status}`;
  const selectedClass = selected ? " is-selected" : "";
  return `map-node map-node--${data.kind}${status}${selectedClass}`;
}

function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Top} id="target-top" />
      <Handle type="target" position={Position.Left} id="target-left" />
      <Handle type="target" position={Position.Right} id="target-right" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" />
      <Handle type="source" position={Position.Left} id="source-left" />
      <Handle type="source" position={Position.Right} id="source-right" />
    </>
  );
}

export function CardNode({ data, selected }: NodeProps<CardFlowNode>) {
  return (
    <div className="map-node-wrap">
      <div className={cardClass(data, selected)}>{data.label}</div>
      <Handles />
    </div>
  );
}

export function SectionNode(_props: NodeProps<SectionFlowNode>) {
  return <div className="map-section" aria-hidden="true" />;
}
