import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runCore, validateProjectDir } from "./index.js";

const referenceMapDir = fileURLToPath(
  new URL("../../../fixtures/reference-map", import.meta.url),
);

describe("committed fixtures", () => {
  it("validates fixtures/reference-map", async () => {
    const result = await runCore(validateProjectDir(referenceMapDir));
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("keeps reference-map topics under sections instead of a spine chain", async () => {
    const graph = JSON.parse(
      await readFile(path.join(referenceMapDir, "plan.graph.json"), "utf8"),
    ) as {
      nodes: { id: string }[];
      edges: { from: string; to: string }[];
    };
    const parentOf = new Map(graph.edges.map((edge) => [edge.to, edge.from]));

    expect(parentOf.get("introduction")).toBe("data-engineer");
    expect(parentOf.get("learn-the-basics")).toBe("data-engineer");
    expect(parentOf.get("git-and-github")).toBe("learn-the-basics");
    expect(parentOf.get("linux-basics")).toBe("learn-the-basics");
    expect(parentOf.get("git-and-github")).not.toBe("data-structures-and-algorithms");

    let maxDepth = 0;
    for (const node of graph.nodes) {
      let depth = 0;
      let current: string | undefined = node.id;
      const seen = new Set<string>();
      while (current && parentOf.has(current) && !seen.has(current)) {
        seen.add(current);
        current = parentOf.get(current);
        depth += 1;
      }
      maxDepth = Math.max(maxDepth, depth);
    }
    expect(maxDepth).toBeLessThanOrEqual(4);
  });
});
