import type { PlanGraph } from "@linklike/protocol";

import tokens from "../../../design/learning-map/tokens.json";

export type NodeKind = "topic" | "subtopic";
export type NodeSide = "spine" | "left" | "right";

export type LaidOutNode = {
  id: string;
  title: string;
  kind: NodeKind;
  side: NodeSide;
  position: { x: number; y: number };
  width: number;
  height: number;
};

export type SectionFrame = {
  id: string;
  parentId: string;
  position: { x: number; y: number };
  width: number;
  height: number;
};

export type LayoutResult = {
  nodes: LaidOutNode[];
  sections: SectionFrame[];
};

export function childrenByParent(graph: PlanGraph): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const node of graph.nodes) {
    children.set(node.id, []);
  }
  const parentOf = new Set<string>();
  // First incoming edge is the --parent used for placement; extra edges still draw.
  for (const edge of graph.edges) {
    if (!children.has(edge.from) || !children.has(edge.to) || parentOf.has(edge.to)) {
      continue;
    }
    parentOf.add(edge.to);
    children.get(edge.from)!.push(edge.to);
  }
  return children;
}

export function rootIds(graph: PlanGraph): string[] {
  const children = childrenByParent(graph);
  const hasParent = new Set<string>();
  for (const kids of children.values()) {
    for (const child of kids) {
      hasParent.add(child);
    }
  }
  const roots = graph.nodes
    .filter((node) => !hasParent.has(node.id))
    .map((node) => node.id);
  return roots.length > 0 ? roots : graph.nodes[0] ? [graph.nodes[0].id] : [];
}

export function nodeWidth(title: string, kind: NodeKind): number {
  const min =
    kind === "topic" ? tokens.layout.topicMinWidth : tokens.layout.subtopicMinWidth;
  const max =
    kind === "topic" ? tokens.layout.topicMaxWidth : tokens.layout.subtopicMaxWidth;
  return Math.min(
    max,
    Math.max(
      min,
      Math.round(title.length * tokens.layout.charWidth + tokens.layout.nodePadX * 2),
    ),
  );
}

export function nodeHeight(title: string, width: number, kind: NodeKind): number {
  const inner = Math.max(8, width - tokens.layout.nodePadX * 2);
  const charsPerLine = Math.max(8, Math.floor(inner / tokens.layout.charWidth));
  const lines = Math.max(1, Math.ceil(title.length / charsPerLine));
  const base =
    kind === "topic" ? tokens.layout.topicHeight : tokens.layout.subtopicHeight;
  return lines <= 1 ? base : base + (lines - 1) * 18;
}

function columnHeight(items: Array<{ height: number }>, gap: number): number {
  if (items.length === 0) {
    return 0;
  }
  return items.reduce((sum, item) => sum + item.height, 0) + (items.length - 1) * gap;
}

function placeColumn(
  items: Array<{ id: string; title: string; width: number; height: number }>,
  topY: number,
  xFor: (width: number) => number,
  side: "left" | "right",
  placed: Map<string, LaidOutNode>,
): void {
  let y = topY;
  for (const item of items) {
    placed.set(item.id, {
      id: item.id,
      title: item.title,
      kind: "subtopic",
      side,
      position: { x: xFor(item.width), y },
      width: item.width,
      height: item.height,
    });
    y += item.height + tokens.layout.subtopicGapY;
  }
}

function sectionFor(
  parentId: string,
  side: "left" | "right",
  leaves: LaidOutNode[],
): SectionFrame | null {
  if (leaves.length < 2) {
    return null;
  }
  const minX = Math.min(...leaves.map((node) => node.position.x));
  const minY = Math.min(...leaves.map((node) => node.position.y));
  const maxX = Math.max(...leaves.map((node) => node.position.x + node.width));
  const maxY = Math.max(...leaves.map((node) => node.position.y + node.height));
  return {
    id: `section:${parentId}:${side}`,
    parentId,
    position: {
      x: minX - tokens.layout.sectionPadX,
      y: minY - tokens.layout.sectionPadY,
    },
    width: maxX - minX + tokens.layout.sectionPadX * 2,
    height: maxY - minY + tokens.layout.sectionPadY * 2,
  };
}

export function layoutLearningMap(graph: PlanGraph): LayoutResult {
  const titles = new Map(graph.nodes.map((node) => [node.id, node.title]));
  const children = childrenByParent(graph);
  const placed = new Map<string, LaidOutNode>();
  const sections: SectionFrame[] = [];

  const spineX =
    tokens.layout.subtopicMaxWidth +
    tokens.layout.sectionPadX +
    tokens.layout.fanGapX +
    tokens.layout.topicMaxWidth / 2;

  const layoutSubtree = (id: string, topY: number): number => {
    const title = titles.get(id) ?? id;
    const kids = children.get(id) ?? [];
    const leaves = kids.filter((child) => (children.get(child)?.length ?? 0) === 0);
    const spineKids = kids.filter((child) => (children.get(child)?.length ?? 0) > 0);
    const kind: NodeKind = kids.length > 0 ? "topic" : "subtopic";
    const width = nodeWidth(title, kind);
    const height = nodeHeight(title, width, kind);

    let cursorY = topY;

    if (leaves.length > 0) {
      const leafSizes = leaves.map((child) => {
        const leafTitle = titles.get(child) ?? child;
        const leafWidth = nodeWidth(leafTitle, "subtopic");
        return {
          id: child,
          title: leafTitle,
          width: leafWidth,
          height: nodeHeight(leafTitle, leafWidth, "subtopic"),
        };
      });
      const left =
        leafSizes.length === 1
          ? []
          : leafSizes.slice(0, Math.ceil(leafSizes.length / 2));
      const right =
        leafSizes.length === 1
          ? leafSizes
          : leafSizes.slice(Math.ceil(leafSizes.length / 2));
      const fanHeight = Math.max(
        columnHeight(left, tokens.layout.subtopicGapY),
        columnHeight(right, tokens.layout.subtopicGapY),
        height,
      );
      const topicY = topY + (fanHeight - height) / 2;
      placed.set(id, {
        id,
        title,
        kind,
        side: "spine",
        position: { x: spineX - width / 2, y: topicY },
        width,
        height,
      });

      const topicLeft = spineX - width / 2;
      const topicRight = spineX + width / 2;
      const leftTop =
        topY + (fanHeight - columnHeight(left, tokens.layout.subtopicGapY)) / 2;
      const rightTop =
        topY + (fanHeight - columnHeight(right, tokens.layout.subtopicGapY)) / 2;
      placeColumn(
        left,
        leftTop,
        (leafWidth) => topicLeft - tokens.layout.fanGapX - leafWidth,
        "left",
        placed,
      );
      placeColumn(
        right,
        rightTop,
        () => topicRight + tokens.layout.fanGapX,
        "right",
        placed,
      );

      const leftPlaced = left
        .map((item) => placed.get(item.id))
        .filter((node): node is LaidOutNode => Boolean(node));
      const rightPlaced = right
        .map((item) => placed.get(item.id))
        .filter((node): node is LaidOutNode => Boolean(node));
      const leftSection = sectionFor(id, "left", leftPlaced);
      const rightSection = sectionFor(id, "right", rightPlaced);
      if (leftSection) {
        sections.push(leftSection);
      }
      if (rightSection) {
        sections.push(rightSection);
      }
      cursorY = topY + fanHeight;
    } else {
      placed.set(id, {
        id,
        title,
        kind,
        side: "spine",
        position: { x: spineX - width / 2, y: topY },
        width,
        height,
      });
      cursorY = topY + height;
    }

    for (const child of spineKids) {
      cursorY += tokens.layout.spineGapY;
      cursorY = layoutSubtree(child, cursorY);
    }

    return cursorY;
  };

  let y = 0;
  for (const root of rootIds(graph)) {
    y = layoutSubtree(root, y) + tokens.layout.spineGapY;
  }

  for (const node of graph.nodes) {
    if (!placed.has(node.id)) {
      const width = nodeWidth(node.title, "subtopic");
      placed.set(node.id, {
        id: node.id,
        title: node.title,
        kind: "subtopic",
        side: "spine",
        position: { x: spineX - width / 2, y },
        width,
        height: nodeHeight(node.title, width, "subtopic"),
      });
      y += placed.get(node.id)!.height + tokens.layout.spineGapY;
    }
  }

  return { nodes: [...placed.values()], sections };
}
