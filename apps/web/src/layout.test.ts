import { describe, expect, it } from "vitest";

import type { PlanGraph } from "@linklike/protocol";

import { layoutLearningMap } from "./layout";

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
});
