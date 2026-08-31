import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { planGraphSchema } from "@linklike/protocol";
import { afterEach, describe, expect, it } from "vitest";

import {
  addNode,
  deleteNode,
  initProjectDir,
  loadProjectDir,
  probeProjectDir,
  runCore,
  setProgress,
  writeNodeContent,
} from "./index.js";

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

describe("probeProjectDir", () => {
  it("reports missing when the path does not exist", async () => {
    const dir = path.join(tmpdir(), `linklike-core-probe-missing-${Date.now()}`);
    await expect(runCore(probeProjectDir(dir))).resolves.toEqual({ kind: "missing" });
  });

  it("reports not-a-directory for a file path", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linklike-core-probe-"));
    dirs.push(dir);
    const filePath = path.join(dir, "not-a-dir");
    await writeFile(filePath, "x\n");
    await expect(runCore(probeProjectDir(filePath))).resolves.toEqual({
      kind: "not-a-directory",
    });
  });

  it("reports uninitialized for an empty directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linklike-core-probe-"));
    dirs.push(dir);
    await expect(runCore(probeProjectDir(dir))).resolves.toEqual({
      kind: "uninitialized",
    });
  });

  it("reports uninitialized when other files exist but none of the init files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linklike-core-probe-"));
    dirs.push(dir);
    await writeFile(path.join(dir, "readme.txt"), "keep me\n");
    await expect(runCore(probeProjectDir(dir))).resolves.toEqual({
      kind: "uninitialized",
    });
  });

  it("reports ready for a valid project", async () => {
    const dir = await makeProject();
    await expect(runCore(probeProjectDir(dir))).resolves.toEqual({ kind: "ready" });
  });

  it("reports invalid when a root note exists without project files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linklike-core-probe-"));
    dirs.push(dir);
    await mkdir(path.join(dir, "nodes"), { recursive: true });
    await writeFile(path.join(dir, "nodes", "root.mdx"), "KEEP THIS NOTE\n");
    const result = await runCore(probeProjectDir(dir));
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it("reports invalid for corrupt JSON", async () => {
    const dir = await makeProject();
    await writeFile(path.join(dir, "project.json"), "{ not valid json\n");
    const result = await runCore(probeProjectDir(dir));
    expect(result.kind).toBe("invalid");
  });
});

describe("initProjectDir", () => {
  it("writes the same layout as CLI init into an empty directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linklike-core-init-"));
    dirs.push(dir);
    const name = path.basename(dir);

    const data = await runCore(initProjectDir(dir));
    expect(data.project.name).toBe(name);
    expect(data.project.version).toBe(1);
    expect(data.graph.nodes).toEqual([{ id: "root", title: name }]);
    expect(data.graph.edges).toEqual([]);
    expect(data.progress.entries.root.status).toBe("learning");

    expect(JSON.parse(await readFile(path.join(dir, "project.json"), "utf8"))).toEqual(
      data.project,
    );
    expect(
      JSON.parse(await readFile(path.join(dir, "plan.graph.json"), "utf8")),
    ).toEqual(data.graph);
    expect(JSON.parse(await readFile(path.join(dir, "progress.json"), "utf8"))).toEqual(
      data.progress,
    );
    expect(await readFile(path.join(dir, "nodes", "root.mdx"), "utf8")).toBe(
      `# ${name}\n\nStart your notes here.\n`,
    );

    const loaded = await runCore(loadProjectDir(dir));
    expect(loaded.project.name).toBe(name);
  });

  it("allows a non-empty directory that has none of the three JSON files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linklike-core-init-"));
    dirs.push(dir);
    await writeFile(path.join(dir, "notes.txt"), "keep me\n");

    await runCore(initProjectDir(dir));
    expect(await readFile(path.join(dir, "notes.txt"), "utf8")).toBe("keep me\n");
    expect(await readFile(path.join(dir, "project.json"), "utf8")).toContain(
      path.basename(dir),
    );
  });

  it("does not create a missing directory", async () => {
    const dir = path.join(tmpdir(), `linklike-core-missing-${Date.now()}`);
    await expect(runCore(initProjectDir(dir))).rejects.toMatchObject({
      _tag: "PathNotFound",
      projectDir: path.resolve(dir),
    });
    await expect(
      readFile(path.join(dir, "project.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses a path that is not a directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linklike-core-init-"));
    dirs.push(dir);
    const filePath = path.join(dir, "not-a-dir");
    await writeFile(filePath, "x\n");
    await expect(runCore(initProjectDir(filePath))).rejects.toMatchObject({
      _tag: "NotADirectory",
    });
  });

  it("does not overwrite when any of the three JSON files already exist", async () => {
    const dir = await makeProject();
    const projectBefore = await readFile(path.join(dir, "project.json"), "utf8");
    const graphBefore = await readFile(path.join(dir, "plan.graph.json"), "utf8");
    const progressBefore = await readFile(path.join(dir, "progress.json"), "utf8");

    await expect(runCore(initProjectDir(dir))).rejects.toMatchObject({
      _tag: "ProjectExists",
    });
    expect(await readFile(path.join(dir, "project.json"), "utf8")).toBe(projectBefore);
    expect(await readFile(path.join(dir, "plan.graph.json"), "utf8")).toBe(graphBefore);
    expect(await readFile(path.join(dir, "progress.json"), "utf8")).toBe(
      progressBefore,
    );
  });

  it("does not overwrite a corrupt project", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linklike-core-init-"));
    dirs.push(dir);
    await writeFile(path.join(dir, "project.json"), "{ not valid json\n");
    await writeFile(path.join(dir, "plan.graph.json"), "{ not valid json\n");
    await writeFile(path.join(dir, "progress.json"), "{ not valid json\n");

    await expect(runCore(initProjectDir(dir))).rejects.toMatchObject({
      _tag: "ProjectExists",
    });
    expect(await readFile(path.join(dir, "project.json"), "utf8")).toBe(
      "{ not valid json\n",
    );
  });

  it("does not overwrite an existing root note", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linklike-core-init-"));
    dirs.push(dir);
    await mkdir(path.join(dir, "nodes"), { recursive: true });
    await writeFile(path.join(dir, "nodes", "root.mdx"), "KEEP THIS NOTE\n");

    await expect(runCore(initProjectDir(dir))).rejects.toMatchObject({
      _tag: "ProjectExists",
    });
    expect(await readFile(path.join(dir, "nodes", "root.mdx"), "utf8")).toBe(
      "KEEP THIS NOTE\n",
    );
    await expect(
      readFile(path.join(dir, "project.json"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("removes files written this round when a later write fails", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linklike-core-init-"));
    dirs.push(dir);
    // Dangling symlink: stat follows (ENOENT) so the conflict check passes; wx then hits EEXIST.
    await symlink("/no/such/linklike-init-target", path.join(dir, "plan.graph.json"));

    await expect(runCore(initProjectDir(dir))).rejects.toMatchObject({
      _tag: "ProjectExists",
    });
    await expect(
      readFile(path.join(dir, "project.json"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      readFile(path.join(dir, "progress.json"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
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

  it("rejects an empty title", async () => {
    const dir = await makeProject();
    await expect(runCore(addNode(dir, { title: "  " }))).rejects.toMatchObject({
      _tag: "EmptyTitle",
    });
  });

  it("does not write progress.json", async () => {
    const dir = await makeProject();
    const before = await readFile(path.join(dir, "progress.json"), "utf8");
    await runCore(addNode(dir, { title: "Child", parent: "root" }));
    expect(await readFile(path.join(dir, "progress.json"), "utf8")).toBe(before);
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

describe.sequential("deleteNode", () => {
  it("removes a leaf, its progress entry, and trashes the note file", async () => {
    const dir = await makeProject();
    await runCore(addNode(dir, { title: "Child", parent: "root" }));
    await runCore(setProgress(dir, "child", "done"));

    const dataHome = await mkdtemp(path.join(tmpdir(), "linklike-trash-"));
    dirs.push(dataHome);
    const previous = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = dataHome;
    try {
      const result = await runCore(deleteNode(dir, "child"));
      expect(result.deletedIds).toEqual(["child"]);
      expect(result.graph.nodes.map((node) => node.id)).toEqual(["root"]);
      expect(result.progress.entries.child).toBeUndefined();

      const graph = planGraphSchema.parse(
        JSON.parse(await readFile(path.join(dir, "plan.graph.json"), "utf8")),
      );
      expect(graph.nodes).toHaveLength(1);
      expect(graph.edges).toEqual([]);

      await expect(
        readFile(path.join(dir, "nodes", "child.mdx"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });

      const trashed = await readFile(
        path.join(dataHome, "Trash", "files", "child.mdx"),
        "utf8",
      );
      expect(trashed).toContain("# Child");
    } finally {
      if (previous === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = previous;
      }
    }
  });

  it("cascade-deletes parent descendants and incident edges", async () => {
    const dir = await makeProject();
    await runCore(addNode(dir, { title: "Mid", parent: "root" }));
    await runCore(addNode(dir, { title: "Leaf", parent: "mid" }));
    await runCore(addNode(dir, { title: "Keep", parent: "root" }));
    await runCore(setProgress(dir, "mid", "done"));
    await runCore(setProgress(dir, "leaf", "skip"));
    await runCore(setProgress(dir, "keep", "learning"));

    const dataHome = await mkdtemp(path.join(tmpdir(), "linklike-trash-"));
    dirs.push(dataHome);
    const previous = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = dataHome;
    try {
      const result = await runCore(deleteNode(dir, "mid"));
      expect(new Set(result.deletedIds)).toEqual(new Set(["mid", "leaf"]));
      expect(result.graph.nodes.map((node) => node.id).sort()).toEqual([
        "keep",
        "root",
      ]);
      expect(result.graph.edges).toEqual([{ from: "root", to: "keep" }]);
      expect(result.progress.entries.mid).toBeUndefined();
      expect(result.progress.entries.leaf).toBeUndefined();
      expect(result.progress.entries.keep.status).toBe("learning");
    } finally {
      if (previous === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = previous;
      }
    }
  });

  it("refuses a delete that would leave zero nodes", async () => {
    const dir = await makeProject();
    const graphBefore = await readFile(path.join(dir, "plan.graph.json"), "utf8");
    await expect(runCore(deleteNode(dir, "root"))).rejects.toMatchObject({
      _tag: "LastNode",
    });
    expect(await readFile(path.join(dir, "plan.graph.json"), "utf8")).toBe(graphBefore);
    expect(await readFile(path.join(dir, "nodes", "root.mdx"), "utf8")).toContain(
      "# Root",
    );
  });

  it("rejects an unknown or illegal node id", async () => {
    const dir = await makeProject();
    await expect(runCore(deleteNode(dir, "ghost"))).rejects.toMatchObject({
      _tag: "UnknownNode",
      nodeId: "ghost",
    });
    await expect(runCore(deleteNode(dir, "../secret"))).rejects.toMatchObject({
      _tag: "InvalidNodeId",
    });
  });

  it("refuses to mutate an invalid project", async () => {
    const dir = await makeProject();
    await runCore(addNode(dir, { title: "Child", parent: "root" }));
    await rm(path.join(dir, "nodes", "root.mdx"));
    await expect(runCore(deleteNode(dir, "child"))).rejects.toMatchObject({
      _tag: "InvalidProject",
    });
    const graph = planGraphSchema.parse(
      JSON.parse(await readFile(path.join(dir, "plan.graph.json"), "utf8")),
    );
    expect(graph.nodes.map((node) => node.id)).toEqual(["root", "child"]);
  });

  it("stays valid when interleaved with setProgress", async () => {
    const dir = await makeProject();
    await runCore(addNode(dir, { title: "Child", parent: "root" }));
    const dataHome = await mkdtemp(path.join(tmpdir(), "linklike-trash-"));
    dirs.push(dataHome);
    const previous = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = dataHome;
    try {
      await Promise.all([
        runCore(deleteNode(dir, "child")),
        runCore(setProgress(dir, "root", "done")),
      ]);
    } finally {
      if (previous === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = previous;
      }
    }

    const load = await runCore(loadProjectDir(dir));
    expect(load.graph.nodes.map((node) => node.id)).toEqual(["root"]);
    expect(load.progress.entries.root.status).toBe("done");
  });

  it.skipIf(process.platform === "win32")(
    "leaves the project valid when progress cannot be written",
    async () => {
      const dir = await makeProject();
      await runCore(addNode(dir, { title: "Child", parent: "root" }));
      await runCore(setProgress(dir, "child", "done"));
      const graphBefore = await readFile(path.join(dir, "plan.graph.json"), "utf8");
      const progressPath = path.join(dir, "progress.json");
      await chmod(progressPath, 0o444);
      try {
        await expect(runCore(deleteNode(dir, "child"))).rejects.toMatchObject({
          _tag: "IoError",
        });
      } finally {
        await chmod(progressPath, 0o644);
      }
      expect(await readFile(path.join(dir, "plan.graph.json"), "utf8")).toBe(
        graphBefore,
      );
      const load = await runCore(loadProjectDir(dir));
      expect(load.graph.nodes.map((node) => node.id)).toEqual(["root", "child"]);
    },
  );

  it("commits graph and progress when trash fails", async () => {
    const dir = await makeProject();
    await runCore(addNode(dir, { title: "Child", parent: "root" }));
    await runCore(setProgress(dir, "child", "done"));
    const dataHome = path.join(dir, "xdg-is-a-file");
    await writeFile(dataHome, "not-a-directory");
    const previous = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = dataHome;
    try {
      const result = await runCore(deleteNode(dir, "child"));
      expect(result.deletedIds).toEqual(["child"]);
    } finally {
      if (previous === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = previous;
      }
    }
    const load = await runCore(loadProjectDir(dir));
    expect(load.graph.nodes.map((node) => node.id)).toEqual(["root"]);
    expect(await readFile(path.join(dir, "nodes", "child.mdx"), "utf8")).toContain(
      "# Child",
    );
  });
});

describe("writeNodeContent", () => {
  it("overwrites the note file and leaves graph and progress unchanged", async () => {
    const dir = await makeProject();
    await runCore(setProgress(dir, "root", "done"));
    const graphBefore = await readFile(path.join(dir, "plan.graph.json"), "utf8");
    const progressBefore = await readFile(path.join(dir, "progress.json"), "utf8");

    const written = await runCore(writeNodeContent(dir, "root", "# Root\n\nEdited.\n"));
    expect(written).toBe("# Root\n\nEdited.\n");
    expect(await readFile(path.join(dir, "nodes", "root.mdx"), "utf8")).toBe(
      "# Root\n\nEdited.\n",
    );
    expect(await readFile(path.join(dir, "plan.graph.json"), "utf8")).toBe(graphBefore);
    expect(await readFile(path.join(dir, "progress.json"), "utf8")).toBe(
      progressBefore,
    );
  });

  it("allows an empty body", async () => {
    const dir = await makeProject();
    await runCore(writeNodeContent(dir, "root", ""));
    expect(await readFile(path.join(dir, "nodes", "root.mdx"), "utf8")).toBe("");
  });

  it("rejects an unknown or illegal node id", async () => {
    const dir = await makeProject();
    await expect(runCore(writeNodeContent(dir, "ghost", "x"))).rejects.toMatchObject({
      _tag: "UnknownNode",
      nodeId: "ghost",
    });
    await expect(
      runCore(writeNodeContent(dir, "../secret", "x")),
    ).rejects.toMatchObject({ _tag: "InvalidNodeId" });
  });

  it("stays valid when interleaved with setProgress", async () => {
    const dir = await makeProject();
    await Promise.all([
      runCore(writeNodeContent(dir, "root", "# Root\n\nRace.\n")),
      runCore(setProgress(dir, "root", "skip")),
    ]);
    const load = await runCore(loadProjectDir(dir));
    expect(await readFile(path.join(dir, "nodes", "root.mdx"), "utf8")).toContain(
      "Race.",
    );
    expect(load.progress.entries.root.status).toBe("skip");
  });

  it("refuses to mutate an invalid project", async () => {
    const dir = await makeProject();
    await runCore(addNode(dir, { title: "Child", parent: "root" }));
    await rm(path.join(dir, "nodes", "root.mdx"));
    await expect(
      runCore(writeNodeContent(dir, "child", "# Child\n")),
    ).rejects.toMatchObject({
      _tag: "InvalidProject",
    });
    expect(await readFile(path.join(dir, "nodes", "child.mdx"), "utf8")).toContain(
      "# Child",
    );
  });
});
