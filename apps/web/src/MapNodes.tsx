import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

export type MapNodeData = {
  label: string;
  kind: "topic" | "subtopic";
  status: "none" | "learning" | "done" | "skip";
  canDelete: boolean;
  adding: boolean;
  draftTitle: string;
  onAdd: () => void;
  onDelete: () => void;
  onDraftChange: (value: string) => void;
  onCommitAdd: () => void;
  onCancelAdd: () => void;
  onOpenNotes: () => void;
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

function stopCardEvent(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export function CardNode({ data, selected }: NodeProps<CardFlowNode>) {
  return (
    <div className="map-node-wrap">
      <div
        className={`map-node-toolbar${selected ? "" : " is-hidden"}`}
        role="toolbar"
        aria-label="Node actions"
        aria-hidden={!selected}
        onMouseDown={stopCardEvent}
        onClick={stopCardEvent}
        onDoubleClick={stopCardEvent}
      >
        {data.adding ? (
          <input
            className="map-node-title-input"
            aria-label="New node title"
            value={data.draftTitle}
            autoFocus
            onChange={(event) => data.onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                data.onCommitAdd();
              } else if (event.key === "Escape") {
                event.preventDefault();
                data.onCancelAdd();
              }
            }}
          />
        ) : (
          <>
            <button type="button" onClick={data.onAdd}>
              Add
            </button>
            {data.canDelete && (
              <button type="button" onClick={data.onDelete}>
                Delete
              </button>
            )}
          </>
        )}
      </div>
      <div
        className={cardClass(data, selected)}
        onDoubleClick={(event) => {
          event.stopPropagation();
          data.onOpenNotes();
        }}
      >
        {data.label}
      </div>
      <Handles />
    </div>
  );
}

export function SectionNode(_props: NodeProps<SectionFlowNode>) {
  return <div className="map-section" aria-hidden="true" />;
}
