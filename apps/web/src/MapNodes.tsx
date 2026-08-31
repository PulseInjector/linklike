import { useState } from "react";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

export type MapNodeData = {
  label: string;
  kind: "topic" | "subtopic";
  status: "none" | "learning" | "done" | "skip";
  canDelete: boolean;
  adding: boolean;
  renaming: boolean;
  onAdd: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCommitAdd: (title: string) => void;
  onCommitRename: (title: string) => void;
  onCancelEdit: () => void;
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
      <Handle type="target" position={Position.Bottom} id="target-bottom" />
      <Handle type="target" position={Position.Left} id="target-left" />
      <Handle type="target" position={Position.Right} id="target-right" />
      <Handle type="source" position={Position.Top} id="source-top" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" />
      <Handle type="source" position={Position.Left} id="source-left" />
      <Handle type="source" position={Position.Right} id="source-right" />
    </>
  );
}

function stopCardEvent(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export function isComposingKey(event: {
  nativeEvent: { isComposing?: boolean; keyCode?: number };
}): boolean {
  // 229 is the IME composition key on some browsers when isComposing is still false.
  return event.nativeEvent.isComposing === true || event.nativeEvent.keyCode === 229;
}

export function CardNode({ data, selected }: NodeProps<CardFlowNode>) {
  const [draftTitle, setDraftTitle] = useState("");
  const editKind = data.adding ? "add" : data.renaming ? "rename" : "idle";
  const [draftKind, setDraftKind] = useState<"idle" | "add" | "rename">("idle");
  if (editKind !== draftKind) {
    setDraftKind(editKind);
    if (editKind === "add") {
      setDraftTitle("");
    } else if (editKind === "rename") {
      setDraftTitle(data.label);
    }
  }

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
        onKeyDown={stopCardEvent}
        onKeyUp={stopCardEvent}
      >
        {data.adding ? (
          <input
            className="map-node-title-input nokey nodrag nopan"
            aria-label="New node title"
            value={draftTitle}
            autoFocus
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (isComposingKey(event)) {
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                data.onCommitAdd(draftTitle);
              } else if (event.key === "Escape") {
                event.preventDefault();
                data.onCancelEdit();
              }
            }}
            onKeyUp={stopCardEvent}
          />
        ) : (
          <>
            <button type="button" onClick={data.onAdd}>
              Add
            </button>
            <button type="button" onClick={data.onRename}>
              Rename
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
          if (data.renaming) {
            return;
          }
          data.onOpenNotes();
        }}
      >
        {data.renaming ? (
          <input
            className="map-node-title-input nokey nodrag nopan"
            aria-label="Node title"
            value={draftTitle}
            autoFocus
            onMouseDown={stopCardEvent}
            onClick={stopCardEvent}
            onDoubleClick={stopCardEvent}
            onChange={(event) => setDraftTitle(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (isComposingKey(event)) {
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                data.onCommitRename(draftTitle);
              } else if (event.key === "Escape") {
                event.preventDefault();
                data.onCancelEdit();
              }
            }}
            onKeyUp={stopCardEvent}
          />
        ) : (
          data.label
        )}
      </div>
      <Handles />
    </div>
  );
}

export function SectionNode(_props: NodeProps<SectionFlowNode>) {
  return <div className="map-section" aria-hidden="true" />;
}
