import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { planGraphSchema } from "@linklike/protocol";
import { afterEach, describe, expect, it } from "vitest";

import { addNode, loadProjectDir, runCore, setProgress } from "./index.js";

const dirs: string[] = [];

async function makeProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "linklike-core-"));
  dirs.push(dir);
  await mkdir(path.join(dir, "nodes"), { recursive: true });
  await writeFile(
    path.join(dir, "project.json"),
    `${JSON.stringify({ version: 1, name: "t", createdAt: "2026-01-01T00:00:00.000Z" }, null, 2)}\n`,
  );
  await writeFile(
    path.join(dir, "plan.graph.json"),
    `${JSON.stringify({ version: 1, nodes: [{ id: "root", title: "Root" }], edges: [] }, null, 2)}\n`,
  );
  await writeFile(
    path.join(dir, "progress.json"),
    `${JSON.stringify({ version: 1, entries: { root: { status: "learning" } } }, null, 2)}\n`,
  );
  await writeFile(path.join(dir, "nodes", "root.mdx"), "# Root\n");
  return dir;
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("addNode", () => {
  it("appends a node, links the parent, and creates the stub", async () => {
    const dir = await makeProject();

    const result = await runCore(addNode(dir, { title: "Pod basics", parent: "root" }));
    expect(result.id).toBe("pod-basics");
    expect(result.nodeFileCreated).toBe(true);

    const graph = planGraphSchema.parse(
      JSON.parse(await readFile(path.join(dir, "plan.graph.json"), "utf8")),
    );
    expect(graph.nodes.map((node) => node.id)).toContain("pod-basics");
    expect(graph.edges).toContainEqual({ from: "root", to: "pod-basics" });

    const stub = await readFile(path.join(dir, "nodes", "pod-basics.mdx"), "utf8");
    expect(stub).toContain("# Pod basics");

    const load = await runCore(loadProjectDir(dir));
    expect(load.project.name).toBe("t");
  });

  it("deduplicates ids from the same title", async () => {
    const dir = await makeProject();
    const first = await runCore(addNode(dir, { title: "Networking" }));
    const second = await runCore(addNode(dir, { title: "Networking" }));
    expect(first.id).toBe("networking");
    expect(second.id).toBe("networking-2");
  });

  it("rejects an unknown parent", async () => {
    const dir = await makeProject();
    await expect(
      runCore(addNode(dir, { title: "X", parent: "nope" })),
    ).rejects.toMatchObject({ _tag: "UnknownParent", parentId: "nope" });
  });

  it("refuses to mutate an invalid project", async () => {
    const dir = await makeProject();
    await rm(path.join(dir, "nodes", "root.mdx"));
    await expect(runCore(addNode(dir, { title: "X" }))).rejects.toMatchObject({
      _tag: "InvalidProject",
    });
    const graph = planGraphSchema.parse(
      JSON.parse(await readFile(path.join(dir, "plan.graph.json"), "utf8")),
    );
    expect(graph.nodes).toHaveLength(1);
  });
});

describe("setProgress", () => {
  it("updates an existing node's status", async () => {
    const dir = await makeProject();
    const progress = await runCore(setProgress(dir, "root", "done"));
    expect(progress.entries.root.status).toBe("done");
  });

  it("clears a status back to unset when written as pending", async () => {
    const dir = await makeProject();
    await runCore(setProgress(dir, "root", "done"));
    const progress = await runCore(setProgress(dir, "root", "pending"));
    expect(progress.entries.root).toBeUndefined();
  });

  it("rejects an unknown node", async () => {
    const dir = await makeProject();
    await expect(runCore(setProgress(dir, "ghost", "done"))).rejects.toMatchObject({
      _tag: "UnknownNode",
      nodeId: "ghost",
    });
  });

  it("does not lose updates when two nodes are set concurrently", async () => {
    const dir = await makeProject();
    await runCore(addNode(dir, { title: "Second", parent: "root" }));

    await Promise.all([
      runCore(setProgress(dir, "root", "done")),
      runCore(setProgress(dir, "second", "skip")),
    ]);

    const progress = JSON.parse(
      await readFile(path.join(dir, "progress.json"), "utf8"),
    ) as { entries: Record<string, { status: string }> };
    expect(progress.entries.root.status).toBe("done");
    expect(progress.entries.second.status).toBe("skip");
  });

  it("refuses to mutate progress on an invalid project", async () => {
    const dir = await makeProject();
    await rm(path.join(dir, "nodes", "root.mdx"));
    await expect(runCore(setProgress(dir, "root", "done"))).rejects.toMatchObject({
      _tag: "InvalidProject",
    });
    const progress = JSON.parse(
      await readFile(path.join(dir, "progress.json"), "utf8"),
    ) as { entries: Record<string, { status: string }> };
    expect(progress.entries.root.status).toBe("learning");
  });

  it("completes alongside a concurrent addNode", async () => {
    const dir = await makeProject();
    await Promise.all([
      runCore(addNode(dir, { title: "Concurrent", parent: "root" })),
      runCore(setProgress(dir, "root", "done")),
    ]);

    const graph = planGraphSchema.parse(
      JSON.parse(await readFile(path.join(dir, "plan.graph.json"), "utf8")),
    );
    expect(graph.nodes.map((node) => node.id)).toContain("concurrent");

    const progress = JSON.parse(
      await readFile(path.join(dir, "progress.json"), "utf8"),
    ) as { entries: Record<string, { status: string }> };
    expect(progress.entries.root.status).toBe("done");
  });
});
