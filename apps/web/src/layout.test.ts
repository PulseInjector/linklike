import { describe, expect, it } from "vitest";

import { planGraphSchema, type PlanGraph } from "@linklike/protocol";

import minimalGraphJson from "../../../fixtures/minimal-project/plan.graph.json";
import {
  childrenByParent,
  edgeHandles,
  layoutLearningMap,
  nodeHeight,
  type LaidOutNode,
} from "./layout";

function graph(
  nodes: Array<{ id: string; title: string }>,
  edges: Array<[string, string]>,
): PlanGraph {
  return {
    version: 1,
    nodes,
    edges: edges.map(([from, to]) => ({ from, to })),
  };
}

describe("layoutLearningMap", () => {
  const sample = graph(
    [
      { id: "root", title: "Data Engineer" },
      { id: "intro", title: "Introduction" },
      { id: "what", title: "What is Data Engineering?" },
      { id: "skills", title: "Skills and Responsibilities" },
      { id: "lifecycle", title: "Data Engineering Lifecycle" },
      { id: "basics", title: "Learn the Basics" },
      { id: "python", title: "Python" },
      { id: "java", title: "Java" },
      { id: "scala", title: "Scala" },
    ],
    [
      ["root", "intro"],
      ["intro", "what"],
      ["intro", "skills"],
      ["intro", "lifecycle"],
      ["root", "basics"],
      ["basics", "python"],
      ["basics", "java"],
      ["basics", "scala"],
    ],
  );

  it("grows estimated height when a title wraps", () => {
    const oneLine = nodeHeight("Python", 180, "subtopic");
    const wrapped = nodeHeight("A".repeat(80), 180, "subtopic");
    expect(wrapped).toBeGreaterThan(oneLine);
  });

  it("puts topics on a vertical spine and fans leaves left and right", () => {
    const { nodes } = layoutLearningMap(sample);
    const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));

    expect(byId.intro.kind).toBe("topic");
    expect(byId.what.kind).toBe("subtopic");
    expect(byId.python.kind).toBe("subtopic");

    const spineX = [byId.root, byId.intro, byId.basics].map(
      (node) => node.position.x + node.width / 2,
    );
    expect(Math.max(...spineX) - Math.min(...spineX)).toBeLessThan(1);
    expect(byId.basics.position.y).toBeGreaterThan(byId.intro.position.y);

    const introLeaves = [byId.what, byId.skills, byId.lifecycle];
    const left = introLeaves.filter((node) => node.side === "left");
    const right = introLeaves.filter((node) => node.side === "right");
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    expect(left[0].position.x + left[0].width).toBeLessThan(byId.intro.position.x);
    expect(right[0].position.x).toBeGreaterThan(
      byId.intro.position.x + byId.intro.width,
    );
  });

  it("does not place every node on one horizontal rank", () => {
    const { nodes } = layoutLearningMap(sample);
    const ys = new Set(nodes.map((node) => Math.round(node.position.y / 20)));
    expect(ys.size).toBeGreaterThan(2);
  });

  it("draws section frames beside a parent with two or more leaves on a side", () => {
    const { sections } = layoutLearningMap(sample);
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.every((section) => section.id.startsWith("section:"))).toBe(true);
  });

  it("ignores extra non-tree edges when placing nodes", () => {
    const withExtra = graph(sample.nodes, [
      ...sample.edges.map((edge) => [edge.from, edge.to] as [string, string]),
      ["python", "what"],
    ]);
    const { nodes } = layoutLearningMap(withExtra);
    const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
    expect(byId.what.side).not.toBe("spine");
    expect(byId.python.kind).toBe("subtopic");
  });

  it("terminates when an extra edge points back at the current root", () => {
    const cyclic = graph(
      [
        { id: "root", title: "Root" },
        { id: "intro", title: "Intro" },
        { id: "what", title: "What" },
      ],
      [
        ["root", "intro"],
        ["intro", "what"],
        ["what", "root"],
      ],
    );
    const { nodes } = layoutLearningMap(cyclic);
    expect(nodes.map((node) => node.id).sort()).toEqual(["intro", "root", "what"]);
    const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
    expect(byId.root.side).toBe("spine");
    expect(byId.what.kind).toBe("subtopic");
  });

  it("terminates on a self-loop", () => {
    const { nodes } = layoutLearningMap(
      graph([{ id: "root", title: "Root" }], [["root", "root"]]),
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.id).toBe("root");
  });
});

function byId(nodes: LaidOutNode[]): Record<string, LaidOutNode> {
  return Object.fromEntries(nodes.map((node) => [node.id, node]));
}

function spineMidX(node: LaidOutNode): number {
  return node.position.x + node.width / 2;
}

function expectSameSpineX(nodes: LaidOutNode[]): void {
  const xs = nodes.map(spineMidX);
  expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1);
}

function expectOffsetX(parent: LaidOutNode, child: LaidOutNode): void {
  expect(Math.abs(spineMidX(parent) - spineMidX(child))).toBeGreaterThan(20);
}

describe("layoutLearningMap deep trees", () => {
  const chain = graph(
    [
      { id: "root", title: "Root" },
      { id: "l1", title: "Level 1" },
      { id: "l2", title: "Level 2" },
      { id: "l3", title: "Level 3" },
      { id: "l4", title: "Level 4" },
    ],
    [
      ["root", "l1"],
      ["l1", "l2"],
      ["l2", "l3"],
      ["l3", "l4"],
    ],
  );

  it("keeps parent pointers nested in a four-level chain", () => {
    const children = childrenByParent(chain);
    expect(children.get("root")).toEqual(["l1"]);
    expect(children.get("l1")).toEqual(["l2"]);
    expect(children.get("l2")).toEqual(["l3"]);
    expect(children.get("l3")).toEqual(["l4"]);
    expect(children.get("l4")).toEqual([]);
  });

  it("keeps only the root and its topic child on the spine", () => {
    const placed = byId(layoutLearningMap(chain).nodes);
    expect(placed.root.side).toBe("spine");
    expect(placed.l1.side).toBe("spine");
    expect(placed.l2.side).not.toBe("spine");
    expect(placed.l3.side).not.toBe("spine");
    expect(placed.l4.side).not.toBe("spine");
    expect(placed.l1.kind).toBe("topic");
    expect(placed.l2.kind).toBe("topic");
    expect(placed.l3.kind).toBe("topic");
    expect(placed.l4.kind).toBe("subtopic");
    expectSameSpineX([placed.root, placed.l1]);
    expect(placed.l1.position.y).toBeGreaterThan(placed.root.position.y);
  });

  it("nests deeper topics beside their parent instead of flattening onto the spine", () => {
    const placed = byId(layoutLearningMap(chain).nodes);
    expectOffsetX(placed.l1, placed.l2);
    expectOffsetX(placed.l2, placed.l3);
    expect(placed.l4.position.y).toBeGreaterThan(
      placed.l3.position.y + placed.l3.height / 2,
    );
  });

  it("keeps a fanned leaf off the spine after it gains a child", () => {
    const leaf = graph(
      [
        { id: "root", title: "Root" },
        { id: "topic", title: "Topic" },
        { id: "child", title: "Child" },
        { id: "sib", title: "Sibling" },
      ],
      [
        ["root", "topic"],
        ["topic", "child"],
        ["topic", "sib"],
      ],
    );
    const withGrandchild = graph(
      [
        { id: "root", title: "Root" },
        { id: "topic", title: "Topic" },
        { id: "child", title: "Child" },
        { id: "sib", title: "Sibling" },
        { id: "grand", title: "Grandchild" },
      ],
      [
        ["root", "topic"],
        ["topic", "child"],
        ["topic", "sib"],
        ["child", "grand"],
      ],
    );

    const before = byId(layoutLearningMap(leaf).nodes);
    const after = byId(layoutLearningMap(withGrandchild).nodes);

    expect(before.child.side).not.toBe("spine");
    expect(before.sib.side).not.toBe("spine");
    expect(after.child.side).not.toBe("spine");
    expect(after.sib.side).not.toBe("spine");
    expect(after.child.kind).toBe("topic");
    expect(after.sib.kind).toBe("subtopic");
    expect(after.grand.kind).toBe("subtopic");
    expectSameSpineX([after.root, after.topic]);
    expectOffsetX(after.topic, after.child);
    expectOffsetX(after.topic, after.sib);
    expect(after.grand.position.y).toBeGreaterThan(after.child.position.y);
  });

  it("draws a section around a nested topic's leaves", () => {
    const { sections } = layoutLearningMap(chain);
    expect(sections.some((section) => section.parentId === "l3")).toBe(true);
  });
});

describe("layoutLearningMap fixtures and bushy nests", () => {
  const minimal = planGraphSchema.parse(minimalGraphJson);

  it("keeps depth-1 topics on the spine and nests workloads beside kubernetes-overview", () => {
    const children = childrenByParent(minimal);
    expect(children.get("root")).toEqual(
      expect.arrayContaining(["kubernetes-overview", "pod-basics"]),
    );
    expect(children.get("kubernetes-overview")).toContain("workloads");
    expect(children.get("workloads")).toEqual(
      expect.arrayContaining(["replicasets", "statefulsets"]),
    );

    const placed = byId(layoutLearningMap(minimal).nodes);
    expect(placed["kubernetes-overview"].side).toBe("spine");
    expect(placed["pod-basics"].side).toBe("spine");
    expect(placed.workloads.side).not.toBe("spine");
    expect(placed.workloads.kind).toBe("topic");
    expect(placed.replicasets.kind).toBe("subtopic");
    expect(placed.statefulsets.kind).toBe("subtopic");
    expectSameSpineX([
      placed.root,
      placed["kubernetes-overview"],
      placed["pod-basics"],
    ]);
    expectOffsetX(placed["kubernetes-overview"], placed.workloads);
    expect(placed.replicasets.position.y).toBeGreaterThan(placed.workloads.position.y);
    expect(placed.statefulsets.position.y).toBeGreaterThan(placed.workloads.position.y);
  });

  const grown = graph(
    [
      { id: "root", title: "LL-DATA" },
      { id: "leaf-a", title: "Leaf A" },
      { id: "mid-b", title: "Mid B" },
      { id: "mid-d", title: "Mid D" },
      { id: "leaf-e", title: "Leaf E" },
      { id: "leaf-f", title: "Leaf F" },
      { id: "mid-g", title: "Mid G" },
      { id: "leaf-h", title: "Leaf H" },
      { id: "agent", title: "agent" },
      { id: "mid-c", title: "Mid C" },
      { id: "mcp", title: "mcp" },
      { id: "n1", title: "协议一" },
      { id: "n2", title: "协议二" },
      { id: "n3", title: "协议三" },
      { id: "n4", title: "协议四" },
      { id: "loop", title: "loop" },
    ],
    [
      ["root", "leaf-a"],
      ["root", "mid-b"],
      ["mid-b", "mid-d"],
      ["mid-d", "leaf-e"],
      ["mid-d", "leaf-f"],
      ["mid-b", "mid-g"],
      ["mid-g", "leaf-h"],
      ["mid-g", "agent"],
      ["root", "mid-c"],
      ["mid-c", "mcp"],
      ["mcp", "n1"],
      ["mcp", "n2"],
      ["n2", "n3"],
      ["n3", "n4"],
      ["root", "loop"],
    ],
  );

  it("preserves the grown-map tree in childrenByParent", () => {
    const children = childrenByParent(grown);
    expect(children.get("root")).toEqual(["leaf-a", "mid-b", "mid-c", "loop"]);
    expect(children.get("mid-b")).toEqual(["mid-d", "mid-g"]);
    expect(children.get("mcp")).toEqual(["n1", "n2"]);
    expect(children.get("n2")).toEqual(["n3"]);
    expect(children.get("n3")).toEqual(["n4"]);
  });

  it("places only root-level topics on the spine of a grown map", () => {
    const placed = byId(layoutLearningMap(grown).nodes);
    expectSameSpineX([placed.root, placed["mid-b"], placed["mid-c"]]);

    for (const id of ["mid-d", "mid-g", "mcp", "n2", "n3"]) {
      expect(placed[id].side, id).not.toBe("spine");
      expect(placed[id].kind, id).toBe("topic");
    }

    expect(placed["leaf-a"].side).not.toBe("spine");
    expect(placed.loop.side).not.toBe("spine");
    expect(placed.n1.kind).toBe("subtopic");
    expect(placed.n4.kind).toBe("subtopic");
    expectOffsetX(placed["mid-b"], placed["mid-d"]);
    expectOffsetX(placed["mid-b"], placed["mid-g"]);
    expectOffsetX(placed["mid-c"], placed.mcp);
  });

  it("keeps parent, child, and sibling distinguishable after a leaf gains a child", () => {
    const placed = byId(layoutLearningMap(grown).nodes);
    expect(placed["mid-d"].kind).toBe("topic");
    expect(placed["mid-g"].kind).toBe("topic");
    expect(placed["leaf-e"].kind).toBe("subtopic");
    expect(placed["leaf-f"].kind).toBe("subtopic");
    expect(
      Math.abs(spineMidX(placed["mid-d"]) - spineMidX(placed["mid-g"])),
    ).toBeGreaterThan(20);
    expect(placed["leaf-e"].position.y).toBeGreaterThan(placed["mid-d"].position.y);
    expect(placed["leaf-h"].position.y).toBeGreaterThan(placed["mid-g"].position.y);
  });
});

describe("edgeHandles", () => {
  it("uses side handles when the target sits beside the source", () => {
    const source = {
      id: "a",
      title: "A",
      kind: "topic" as const,
      side: "spine" as const,
      position: { x: 100, y: 100 },
      width: 80,
      height: 40,
    };
    const target = {
      id: "b",
      title: "B",
      kind: "subtopic" as const,
      side: "right" as const,
      position: { x: 220, y: 100 },
      width: 80,
      height: 40,
    };
    expect(edgeHandles(source, target)).toEqual({
      sourceHandle: "source-right",
      targetHandle: "target-left",
    });
  });

  it("uses vertical handles when the target sits below the source", () => {
    const source = {
      id: "a",
      title: "A",
      kind: "topic" as const,
      side: "right" as const,
      position: { x: 200, y: 40 },
      width: 80,
      height: 40,
    };
    const target = {
      id: "b",
      title: "B",
      kind: "subtopic" as const,
      side: "right" as const,
      position: { x: 200, y: 120 },
      width: 80,
      height: 40,
    };
    expect(edgeHandles(source, target)).toEqual({
      sourceHandle: "source-bottom",
      targetHandle: "target-top",
    });
  });
});

describe("internal hierarchy (screenshot: 你好 / 111 / 222 / 9999 / 000 / 33)", () => {
  const titles = [
    { id: "root", title: "Root" },
    { id: "nihao", title: "你好" },
    { id: "n111", title: "111" },
    { id: "n222", title: "222" },
    { id: "n9999", title: "9999" },
    { id: "n000", title: "000" },
    { id: "n33", title: "33" },
  ];

  const asSiblingsUnder111 = graph(titles, [
    ["root", "nihao"],
    ["nihao", "n111"],
    ["n111", "n222"],
    ["n111", "n9999"],
    ["n111", "n000"],
    ["n111", "n33"],
  ]);

  const asChain = graph(titles, [
    ["root", "nihao"],
    ["nihao", "n111"],
    ["n111", "n222"],
    ["n222", "n9999"],
    ["n9999", "n000"],
    ["n000", "n33"],
  ]);

  it("keeps sibling leaves as subtopics in one section without mixing in their grandparent", () => {
    const placed = byId(layoutLearningMap(asSiblingsUnder111).nodes);
    expect(placed.n9999.kind).toBe("subtopic");
    expect(placed.n000.kind).toBe("subtopic");
    expect(placed.n111.kind).toBe("topic");
    expectOffsetX(placed.nihao, placed.n111);
    expectOffsetX(placed.nihao, placed.n9999);
    expect(Math.abs(spineMidX(placed.n9999) - spineMidX(placed.n000))).toBeLessThan(40);
  });

  it("does not stack a parent-child chain of nested topics in one column", () => {
    const placed = byId(layoutLearningMap(asChain).nodes);
    expect(placed.n222.kind).toBe("topic");
    expect(placed.n9999.kind).toBe("topic");
    expect(placed.n000.kind).toBe("topic");
    expect(placed.n33.kind).toBe("subtopic");
    expectOffsetX(placed.n111, placed.n222);
    expectOffsetX(placed.n222, placed.n9999);
    expectOffsetX(placed.n9999, placed.n000);
    expect(placed.n33.position.y).toBeGreaterThan(
      placed.n000.position.y + placed.n000.height / 2,
    );
  });

  it("moves a nested topic outboard of sibling leaves after it gains a child", () => {
    const withNested = graph(titles, [
      ["root", "nihao"],
      ["nihao", "n111"],
      ["n111", "n222"],
      ["n111", "n9999"],
      ["n111", "n000"],
      ["n9999", "n33"],
    ]);
    const placed = byId(layoutLearningMap(withNested).nodes);
    expect(placed.n222.kind).toBe("subtopic");
    expect(placed.n000.kind).toBe("subtopic");
    expect(placed.n9999.kind).toBe("topic");
    expect(placed.n33.kind).toBe("subtopic");
    const leafRight = Math.max(
      placed.n222.position.x + placed.n222.width,
      placed.n000.position.x + placed.n000.width,
    );
    expect(placed.n9999.position.x).toBeGreaterThan(leafRight - 8);
  });
});
