import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";

const fixtureDir = fileURLToPath(
  new URL("../../../fixtures/minimal-project", import.meta.url),
);

async function makeTempProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "linklike-api-"));
  await mkdir(path.join(dir, "nodes"), { recursive: true });
  await writeFile(
    path.join(dir, "project.json"),
    `${JSON.stringify({ version: 1, name: "temp", createdAt: "2026-01-01T00:00:00.000Z" }, null, 2)}\n`,
  );
  await writeFile(
    path.join(dir, "plan.graph.json"),
    `${JSON.stringify({ version: 1, nodes: [{ id: "root", title: "Root" }], edges: [] }, null, 2)}\n`,
  );
  await writeFile(
    path.join(dir, "progress.json"),
    `${JSON.stringify({ version: 1, entries: { root: { status: "learning" } } }, null, 2)}\n`,
  );
  await writeFile(path.join(dir, "nodes", "root.mdx"), "# Root\n\nNotes.\n");
  return dir;
}

describe("api", () => {
  const app = createApp();

  it("requires a path query on GET /project", async () => {
    const res = await app.request("/project");
    expect(res.status).toBe(400);
  });

  it("probes folder kind without treating an empty directory as invalid", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linklike-api-probe-"));
    tempDirs.push(dir);
    const res = await app.request(`/project/probe?path=${encodeURIComponent(dir)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "uninitialized" });
  });

  it("probes a valid directory as ready", async () => {
    const res = await app.request(
      `/project/probe?path=${encodeURIComponent(fixtureDir)}`,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "ready" });
  });

  it("probes a missing path as missing", async () => {
    const dir = path.join(tmpdir(), `linklike-api-probe-missing-${Date.now()}`);
    const res = await app.request(`/project/probe?path=${encodeURIComponent(dir)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "missing" });
  });

  it("returns project data for a valid directory", async () => {
    const res = await app.request(`/project?path=${encodeURIComponent(fixtureDir)}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      project: { name: string };
      graph: { nodes: unknown[] };
    };
    expect(body.project.name).toBe("minimal");
    expect(body.graph.nodes.length).toBeGreaterThan(0);
  });

  it("returns node markdown", async () => {
    const res = await app.request(
      `/project/nodes/root?path=${encodeURIComponent(fixtureDir)}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { markdown: string };
    expect(body.markdown).toContain("Minimal example");
  });

  it("rejects unsafe node ids", async () => {
    const res = await app.request(
      `/project/nodes/${encodeURIComponent("../../secret")}?path=${encodeURIComponent(fixtureDir)}`,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { tag: string };
    expect(body.tag).toBe("InvalidNodeId");
  });

  it("updates progress via PATCH", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);

    const res = await app.request("/project/progress", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir, nodeId: "root", status: "done" }),
    });

    expect(res.status).toBe(200);
    const written = JSON.parse(
      await readFile(path.join(dir, "progress.json"), "utf8"),
    ) as { entries: Record<string, { status: string }> };
    expect(written.entries.root.status).toBe("done");
  });

  it("clears progress via PATCH pending", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);

    const res = await app.request("/project/progress", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir, nodeId: "root", status: "pending" }),
    });

    expect(res.status).toBe(200);
    const written = JSON.parse(
      await readFile(path.join(dir, "progress.json"), "utf8"),
    ) as { entries: Record<string, { status: string }> };
    expect(written.entries.root).toBeUndefined();
  });

  it("rejects progress updates on an invalid project", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);
    await rm(path.join(dir, "nodes", "root.mdx"));

    const res = await app.request("/project/progress", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir, nodeId: "root", status: "done" }),
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { tag: string };
    expect(body.tag).toBe("InvalidProject");
  });

  it("rejects an invalid status", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);

    const res = await app.request("/project/progress", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir, nodeId: "root", status: "nope" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { tag: string };
    expect(body.tag).toBe("InvalidStatus");
  });

  it("adds a node via POST", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);

    const res = await app.request("/project/nodes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir, title: "Pod basics", parent: "root" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; graph: { edges: unknown[] } };
    expect(body.id).toBe("pod-basics");
    const graph = JSON.parse(
      await readFile(path.join(dir, "plan.graph.json"), "utf8"),
    ) as { nodes: { id: string }[]; edges: unknown[] };
    expect(graph.nodes.map((node) => node.id)).toContain("pod-basics");
    expect(graph.edges).toContainEqual({ from: "root", to: "pod-basics" });
    const stub = await readFile(path.join(dir, "nodes", "pod-basics.mdx"), "utf8");
    expect(stub).toContain("# Pod basics");
  });

  it("rejects an empty title on POST", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);

    const res = await app.request("/project/nodes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir, title: " " }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { tag: string };
    expect(body.tag).toBe("EmptyTitle");
  });

  it("rejects an unknown parent on POST", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);

    const res = await app.request("/project/nodes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir, title: "X", parent: "nope" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { tag: string };
    expect(body.tag).toBe("UnknownParent");
  });

  it("writes node markdown via PUT", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);
    const graphBefore = await readFile(path.join(dir, "plan.graph.json"), "utf8");
    const progressBefore = await readFile(path.join(dir, "progress.json"), "utf8");

    const res = await app.request("/project/nodes/root", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir, markdown: "# Root\n\nEdited.\n" }),
    });

    expect(res.status).toBe(200);
    expect(await readFile(path.join(dir, "nodes", "root.mdx"), "utf8")).toBe(
      "# Root\n\nEdited.\n",
    );
    expect(await readFile(path.join(dir, "plan.graph.json"), "utf8")).toBe(graphBefore);
    expect(await readFile(path.join(dir, "progress.json"), "utf8")).toBe(
      progressBefore,
    );
  });

  it("allows an empty markdown body on PUT", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);

    const res = await app.request("/project/nodes/root", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir, markdown: "" }),
    });

    expect(res.status).toBe(200);
    expect(await readFile(path.join(dir, "nodes", "root.mdx"), "utf8")).toBe("");
  });

  it("renames a node title via PATCH and leaves the note file unchanged", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);
    const noteBefore = await readFile(path.join(dir, "nodes", "root.mdx"), "utf8");
    const progressBefore = await readFile(path.join(dir, "progress.json"), "utf8");

    const res = await app.request("/project/nodes/root", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir, title: "Renamed root" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      graph: { nodes: Array<{ id: string; title: string }> };
    };
    expect(body.id).toBe("root");
    expect(body.graph.nodes).toEqual([{ id: "root", title: "Renamed root" }]);
    const graph = JSON.parse(
      await readFile(path.join(dir, "plan.graph.json"), "utf8"),
    ) as { nodes: Array<{ id: string; title: string }> };
    expect(graph.nodes).toEqual([{ id: "root", title: "Renamed root" }]);
    expect(await readFile(path.join(dir, "nodes", "root.mdx"), "utf8")).toBe(
      noteBefore,
    );
    expect(await readFile(path.join(dir, "progress.json"), "utf8")).toBe(
      progressBefore,
    );
  });

  it("rejects an empty title on PATCH", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);

    const res = await app.request("/project/nodes/root", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir, title: " " }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { tag: string };
    expect(body.tag).toBe("EmptyTitle");
  });

  it("rejects an unknown node on PATCH", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);

    const res = await app.request("/project/nodes/ghost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir, title: "X" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { tag: string };
    expect(body.tag).toBe("UnknownNode");
  });

  it("rejects PUT on an invalid project", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);
    await rm(path.join(dir, "nodes", "root.mdx"));

    const res = await app.request("/project/nodes/root", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir, markdown: "# Root\n" }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { tag: string };
    expect(body.tag).toBe("InvalidProject");
  });

  it("rejects an illegal node id on PUT", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);

    const res = await app.request(
      `/project/nodes/${encodeURIComponent("../../secret")}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: dir, markdown: "x" }),
      },
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { tag: string };
    expect(body.tag).toBe("InvalidNodeId");
  });

  it("cascade-deletes via DELETE and refuses the last node", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);

    await app.request("/project/nodes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir, title: "Child", parent: "root" }),
    });

    const dataHome = await mkdtemp(path.join(tmpdir(), "linklike-api-trash-"));
    tempDirs.push(dataHome);
    const previous = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = dataHome;
    try {
      const res = await app.request(
        `/project/nodes/child?path=${encodeURIComponent(dir)}`,
        { method: "DELETE" },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { deletedIds: string[] };
      expect(body.deletedIds).toEqual(["child"]);
      await expect(
        readFile(path.join(dir, "nodes", "child.mdx"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(
        await readFile(path.join(dataHome, "Trash", "files", "child.mdx"), "utf8"),
      ).toContain("# Child");
    } finally {
      if (previous === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = previous;
      }
    }

    const last = await app.request(
      `/project/nodes/root?path=${encodeURIComponent(dir)}`,
      { method: "DELETE" },
    );
    expect(last.status).toBe(400);
    const lastBody = (await last.json()) as { tag: string };
    expect(lastBody.tag).toBe("LastNode");
    expect(await readFile(path.join(dir, "nodes", "root.mdx"), "utf8")).toContain(
      "# Root",
    );
  });

  it("stays valid when DELETE is interleaved with PATCH progress", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);

    await app.request("/project/nodes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir, title: "Child", parent: "root" }),
    });

    const dataHome = await mkdtemp(path.join(tmpdir(), "linklike-api-trash-"));
    tempDirs.push(dataHome);
    const previous = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = dataHome;
    try {
      const [del, patch] = await Promise.all([
        app.request(`/project/nodes/child?path=${encodeURIComponent(dir)}`, {
          method: "DELETE",
        }),
        app.request("/project/progress", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: dir, nodeId: "root", status: "done" }),
        }),
      ]);
      expect(del.status).toBe(200);
      expect(patch.status).toBe(200);
    } finally {
      if (previous === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = previous;
      }
    }

    const project = await app.request(`/project?path=${encodeURIComponent(dir)}`);
    expect(project.status).toBe(200);
  });
});

describe("POST /project/init", () => {
  it("initializes an empty directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linklike-api-init-"));
    tempDirs.push(dir);
    const app = createApp();

    const res = await app.request("/project/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { project: { name: string } };
    expect(body.project.name).toBe(path.basename(dir));
    expect(await readFile(path.join(dir, "nodes", "root.mdx"), "utf8")).toContain(
      `# ${path.basename(dir)}`,
    );
  });

  it("does not create a missing directory", async () => {
    const dir = path.join(tmpdir(), `linklike-api-missing-${Date.now()}`);
    const app = createApp();
    const res = await app.request("/project/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { tag: string };
    expect(body.tag).toBe("PathNotFound");
    await expect(
      readFile(path.join(dir, "project.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not overwrite a corrupt project", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);
    await writeFile(path.join(dir, "project.json"), "{ not valid json\n");
    const app = createApp();
    const res = await app.request("/project/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { tag: string };
    expect(body.tag).toBe("ProjectExists");
    expect(await readFile(path.join(dir, "project.json"), "utf8")).toBe(
      "{ not valid json\n",
    );
  });

  it("rejects an empty path", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "linklike-api-init-cwd-"));
    tempDirs.push(cwd);
    const previous = process.cwd();
    process.chdir(cwd);
    try {
      const app = createApp();
      const res = await app.request("/project/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "" }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("path is a required string");
      await expect(
        readFile(path.join(cwd, "project.json"), "utf8"),
      ).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      process.chdir(previous);
    }
  });

  it("rejects a whitespace-only path", async () => {
    const app = createApp();
    const res = await app.request("/project/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "   " }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /project/pick-directory", () => {
  it("writes the picked path", async () => {
    const app = createApp({
      pickFolder: async () => ({ ok: true, path: "/tmp/picked" }),
    });
    const res = await app.request("/project/pick-directory", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: "/tmp/picked" });
  });

  it("returns cancelled when the dialog is dismissed", async () => {
    const app = createApp({
      pickFolder: async () => ({ ok: false, reason: "cancelled" }),
    });
    const res = await app.request("/project/pick-directory", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cancelled: true });
  });

  it("returns 503 when the system dialog is unavailable", async () => {
    const app = createApp({
      pickFolder: async () => ({ ok: false, reason: "unavailable" }),
    });
    const res = await app.request("/project/pick-directory", { method: "POST" });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { tag: string };
    expect(body.tag).toBe("FolderPickerUnavailable");
  });
});

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await import("node:fs/promises").then((fs) =>
        fs.rm(dir, { recursive: true, force: true }),
      );
    }),
  );
});
