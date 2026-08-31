import { describe, expect, it } from "vitest";

import { subtreeNodeIds, validateGraphIntegrity } from "./index.js";

describe("validateGraphIntegrity", () => {
  it("reports a missing edge target", () => {
    const errors = validateGraphIntegrity({
      version: 1,
      nodes: [{ id: "root", title: "Root" }],
      edges: [{ from: "root", to: "missing" }],
    });

    expect(errors).toContain("edge references missing node: missing");
  });
});

describe("subtreeNodeIds", () => {
  it("includes the node and its descendants", () => {
    const ids = subtreeNodeIds(
      {
        version: 1,
        nodes: [
          { id: "root", title: "Root" },
          { id: "mid", title: "Mid" },
          { id: "leaf", title: "Leaf" },
          { id: "keep", title: "Keep" },
        ],
        edges: [
          { from: "root", to: "mid" },
          { from: "mid", to: "leaf" },
          { from: "root", to: "keep" },
        ],
      },
      "mid",
    );
    expect(ids).toEqual(new Set(["mid", "leaf"]));
  });

  it("covers the whole graph from the unique root", () => {
    const graph = {
      version: 1 as const,
      nodes: [
        { id: "root", title: "Root" },
        { id: "child", title: "Child" },
      ],
      edges: [{ from: "root", to: "child" }],
    };
    expect(subtreeNodeIds(graph, "root").size).toBe(graph.nodes.length);
    expect(subtreeNodeIds(graph, "child").size).toBe(1);
  });
});
