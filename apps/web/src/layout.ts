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

type Block = {
  width: number;
  height: number;
  nodes: LaidOutNode[];
  sections: SectionFrame[];
};

function wouldCycle(parentOf: Map<string, string>, from: string, to: string): boolean {
  let cur: string | undefined = from;
  const seen = new Set<string>();
  while (cur) {
    if (cur === to) {
      return true;
    }
    if (seen.has(cur)) {
      return true;
    }
    seen.add(cur);
    cur = parentOf.get(cur);
  }
  return false;
}

export function childrenByParent(graph: PlanGraph): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const node of graph.nodes) {
    children.set(node.id, []);
  }
  const parentOf = new Map<string, string>();
  // First incoming edge is the --parent used for placement; extra edges still draw.
  // Schema allows cycles; skip an edge that would parent a node under its descendant.
  for (const edge of graph.edges) {
    if (
      !children.has(edge.from) ||
      !children.has(edge.to) ||
      parentOf.has(edge.to) ||
      edge.from === edge.to ||
      wouldCycle(parentOf, edge.from, edge.to)
    ) {
      continue;
    }
    parentOf.set(edge.to, edge.from);
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
  // extraLineHeight ≈ 17px × line-height 1.2; measured long titles still fit one line.
  return lines <= 1 ? base : base + (lines - 1) * tokens.layout.extraLineHeight;
}

function columnHeight(items: Array<{ height: number }>, gap: number): number {
  if (items.length === 0) {
    return 0;
  }
  return items.reduce((sum, item) => sum + item.height, 0) + (items.length - 1) * gap;
}

function translateBlock(block: Block, dx: number, dy: number): Block {
  return {
    width: block.width,
    height: block.height,
    nodes: block.nodes.map((node) => ({
      ...node,
      position: { x: node.position.x + dx, y: node.position.y + dy },
    })),
    sections: block.sections.map((section) => ({
      ...section,
      position: { x: section.position.x + dx, y: section.position.y + dy },
    })),
  };
}

function boundsOf(
  nodes: Array<{ position: { x: number; y: number }; width: number; height: number }>,
  sections: SectionFrame[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (nodes.length === 0 && sections.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + node.width);
    maxY = Math.max(maxY, node.position.y + node.height);
  }
  for (const section of sections) {
    minX = Math.min(minX, section.position.x);
    minY = Math.min(minY, section.position.y);
    maxX = Math.max(maxX, section.position.x + section.width);
    maxY = Math.max(maxY, section.position.y + section.height);
  }
  return { minX, minY, maxX, maxY };
}

function normalizeBlock(nodes: LaidOutNode[], sections: SectionFrame[]): Block {
  const bounds = boundsOf(nodes, sections);
  if (!bounds) {
    return { width: 0, height: 0, nodes, sections };
  }
  return translateBlock(
    {
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
      nodes,
      sections,
    },
    -bounds.minX,
    -bounds.minY,
  );
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

function nestedSection(
  parentId: string,
  topic: LaidOutNode,
  kids: LaidOutNode[],
): SectionFrame {
  const minX = Math.min(topic.position.x, ...kids.map((node) => node.position.x));
  const maxX = Math.max(
    topic.position.x + topic.width,
    ...kids.map((node) => node.position.x + node.width),
  );
  const maxY = Math.max(...kids.map((node) => node.position.y + node.height));
  // Topic sits on the section's top border, like Data Lake / Column on the reference map.
  const top = topic.position.y + topic.height / 2;
  return {
    id: `section:${parentId}`,
    parentId,
    position: {
      x: minX - tokens.layout.sectionPadX,
      y: top,
    },
    width: maxX - minX + tokens.layout.sectionPadX * 2,
    height: maxY - top + tokens.layout.sectionPadY,
  };
}

export function edgeHandles(
  source: LaidOutNode,
  target: LaidOutNode,
): { sourceHandle: string; targetHandle: string } {
  // Centers of a wide parent and a narrow child can sit farther apart horizontally
  // than vertically even when the boxes share a column; overlap decides the axis.
  const overlapX =
    Math.min(source.position.x + source.width, target.position.x + target.width) -
    Math.max(source.position.x, target.position.x);
  const sourceCy = source.position.y + source.height / 2;
  const targetCy = target.position.y + target.height / 2;
  if (overlapX > 0) {
    if (targetCy < sourceCy) {
      return { sourceHandle: "source-top", targetHandle: "target-bottom" };
    }
    return { sourceHandle: "source-bottom", targetHandle: "target-top" };
  }
  const sourceCx = source.position.x + source.width / 2;
  const targetCx = target.position.x + target.width / 2;
  if (targetCx < sourceCx) {
    return { sourceHandle: "source-left", targetHandle: "target-right" };
  }
  return { sourceHandle: "source-right", targetHandle: "target-left" };
}

// Only the root and its topic children stay on the spine; deeper topics nest in the fan.
function spineTopicIds(graph: PlanGraph, children: Map<string, string[]>): Set<string> {
  const roots = rootIds(graph);
  const ids = new Set(roots);
  for (const root of roots) {
    for (const child of children.get(root) ?? []) {
      if ((children.get(child)?.length ?? 0) > 0) {
        ids.add(child);
      }
    }
  }
  return ids;
}

export function layoutLearningMap(graph: PlanGraph): LayoutResult {
  const titles = new Map(graph.nodes.map((node) => [node.id, node.title]));
  const children = childrenByParent(graph);
  const onSpine = spineTopicIds(graph, children);
  const visiting = new Set<string>();
  const placed = new Map<string, LaidOutNode>();
  const sections: SectionFrame[] = [];

  const layoutFanBlock = (id: string, side: "left" | "right"): Block => {
    if (placed.has(id) || visiting.has(id)) {
      return { width: 0, height: 0, nodes: [], sections: [] };
    }
    visiting.add(id);

    const title = titles.get(id) ?? id;
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      const width = nodeWidth(title, "subtopic");
      const height = nodeHeight(title, width, "subtopic");
      visiting.delete(id);
      return {
        width,
        height,
        nodes: [
          {
            id,
            title,
            kind: "subtopic",
            side,
            position: { x: 0, y: 0 },
            width,
            height,
          },
        ],
        sections: [],
      };
    }

    const topicWidth = nodeWidth(title, "topic");
    const topicHeight = nodeHeight(title, topicWidth, "topic");
    const gapY = tokens.layout.subtopicGapY;
    const leafKids = kids.filter((kid) => (children.get(kid)?.length ?? 0) === 0);
    const nestedKids = kids.filter((kid) => (children.get(kid)?.length ?? 0) > 0);
    const leafBlocks = leafKids
      .map((kid) => layoutFanBlock(kid, side))
      .filter((block) => block.nodes.length > 0);
    const nestedBlocks = nestedKids
      .map((kid) => layoutFanBlock(kid, side))
      .filter((block) => block.nodes.length > 0);
    const leafColW = leafBlocks.reduce((max, block) => Math.max(max, block.width), 0);
    const nestedColW = nestedBlocks.reduce(
      (max, block) => Math.max(max, block.width),
      0,
    );
    const innerW = Math.max(topicWidth, leafColW);
    // Nested topics sit outboard of this card, like Column / Document beside NoSQL on the reference map.
    const gapX = nestedBlocks.length > 0 ? tokens.layout.fanGapX : 0;
    const innerX = side === "right" ? 0 : nestedColW + gapX;
    const nestedX = side === "right" ? innerW + gapX : 0;

    const topic: LaidOutNode = {
      id,
      title,
      kind: "topic",
      side,
      position: {
        x: side === "right" ? innerX : innerX + innerW - topicWidth,
        y: 0,
      },
      width: topicWidth,
      height: topicHeight,
    };

    const nodes: LaidOutNode[] = [topic];
    const frames: SectionFrame[] = [];
    let leafY = topicHeight + gapY;
    for (let index = 0; index < leafBlocks.length; index += 1) {
      const leaf = leafBlocks[index]!;
      const leafX = side === "right" ? innerX : innerX + innerW - leaf.width;
      const shifted = translateBlock(leaf, leafX, leafY);
      nodes.push(...shifted.nodes);
      frames.push(...shifted.sections);
      leafY += leaf.height;
      if (index < leafBlocks.length - 1) {
        leafY += gapY;
      }
    }

    let nestY = 0;
    for (let index = 0; index < nestedBlocks.length; index += 1) {
      const nested = nestedBlocks[index]!;
      const blockX = side === "right" ? nestedX : nestedX + nestedColW - nested.width;
      const shifted = translateBlock(nested, blockX, nestY);
      nodes.push(...shifted.nodes);
      frames.push(...shifted.sections);
      nestY += nested.height;
      if (index < nestedBlocks.length - 1) {
        nestY += gapY;
      }
    }

    const leafCards = nodes.filter(
      (node) => leafKids.includes(node.id) && node.kind === "subtopic",
    );
    if (leafCards.length > 0) {
      frames.push(nestedSection(id, topic, leafCards));
    }
    visiting.delete(id);
    return normalizeBlock(nodes, frames);
  };

  const commitBlock = (block: Block, dx: number, dy: number): void => {
    const shifted = translateBlock(block, dx, dy);
    for (const node of shifted.nodes) {
      if (!placed.has(node.id)) {
        placed.set(node.id, node);
      }
    }
    sections.push(...shifted.sections);
  };

  const placeBlockColumn = (
    blocks: Block[],
    topY: number,
    xFor: (width: number) => number,
  ): void => {
    let y = topY;
    for (const block of blocks) {
      commitBlock(block, xFor(block.width), y);
      y += block.height + tokens.layout.subtopicGapY;
    }
  };

  const layoutSpineTopic = (id: string, topY: number): number => {
    if (placed.has(id) || visiting.has(id)) {
      return topY;
    }
    visiting.add(id);

    const title = titles.get(id) ?? id;
    const kids = children.get(id) ?? [];
    const fanKids = kids.filter((child) => !onSpine.has(child));
    const belowKids = kids.filter((child) => onSpine.has(child));
    const kind: NodeKind = kids.length > 0 ? "topic" : "subtopic";
    const width = nodeWidth(title, kind);
    const height = nodeHeight(title, width, kind);

    const split = Math.ceil(fanKids.length / 2);
    const leftIds = fanKids.length <= 1 ? [] : fanKids.slice(0, split);
    const rightIds = fanKids.length <= 1 ? fanKids : fanKids.slice(split);
    const leftBlocks = leftIds
      .map((child) => layoutFanBlock(child, "left"))
      .filter((block) => block.nodes.length > 0);
    const rightBlocks = rightIds
      .map((child) => layoutFanBlock(child, "right"))
      .filter((block) => block.nodes.length > 0);
    const fanHeight = Math.max(
      columnHeight(leftBlocks, tokens.layout.subtopicGapY),
      columnHeight(rightBlocks, tokens.layout.subtopicGapY),
      height,
    );
    const topicY = topY + (fanHeight - height) / 2;
    placed.set(id, {
      id,
      title,
      kind,
      side: "spine",
      position: { x: -width / 2, y: topicY },
      width,
      height,
    });

    const topicLeft = -width / 2;
    const topicRight = width / 2;
    const leftTop =
      topY + (fanHeight - columnHeight(leftBlocks, tokens.layout.subtopicGapY)) / 2;
    const rightTop =
      topY + (fanHeight - columnHeight(rightBlocks, tokens.layout.subtopicGapY)) / 2;
    placeBlockColumn(
      leftBlocks,
      leftTop,
      (blockWidth) => topicLeft - tokens.layout.fanGapX - blockWidth,
    );
    placeBlockColumn(rightBlocks, rightTop, () => topicRight + tokens.layout.fanGapX);

    const leftLeaves = leftIds
      .map((child) => placed.get(child))
      .filter((node): node is LaidOutNode => node != null && node.kind === "subtopic");
    const rightLeaves = rightIds
      .map((child) => placed.get(child))
      .filter((node): node is LaidOutNode => node != null && node.kind === "subtopic");
    if (leftLeaves.length === leftIds.length) {
      const leftSection = sectionFor(id, "left", leftLeaves);
      if (leftSection) {
        sections.push(leftSection);
      }
    }
    if (rightLeaves.length === rightIds.length) {
      const rightSection = sectionFor(id, "right", rightLeaves);
      if (rightSection) {
        sections.push(rightSection);
      }
    }

    visiting.delete(id);
    let cursorY = topY + fanHeight;
    for (const child of belowKids) {
      cursorY += tokens.layout.spineGapY;
      cursorY = layoutSpineTopic(child, cursorY);
    }
    return cursorY;
  };

  let y = 0;
  for (const root of rootIds(graph)) {
    y = layoutSpineTopic(root, y) + tokens.layout.spineGapY;
  }

  for (const node of graph.nodes) {
    if (!placed.has(node.id)) {
      const width = nodeWidth(node.title, "subtopic");
      placed.set(node.id, {
        id: node.id,
        title: node.title,
        kind: "subtopic",
        side: "spine",
        position: { x: -width / 2, y },
        width,
        height: nodeHeight(node.title, width, "subtopic"),
      });
      y += placed.get(node.id)!.height + tokens.layout.spineGapY;
    }
  }

  const nodes = [...placed.values()];
  const box = boundsOf(nodes, sections);
  if (!box) {
    return { nodes, sections };
  }
  const dx = -box.minX;
  const dy = -box.minY;
  return {
    nodes: nodes.map((node) => ({
      ...node,
      position: { x: node.position.x + dx, y: node.position.y + dy },
    })),
    sections: sections.map((section) => ({
      ...section,
      position: { x: section.position.x + dx, y: section.position.y + dy },
    })),
  };
}
