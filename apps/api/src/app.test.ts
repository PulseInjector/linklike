import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

  it("rejects an invalid status", async () => {
    const dir = await makeTempProject();
    tempDirs.push(dir);

    const res = await app.request("/project/progress", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: dir, nodeId: "root", status: "nope" }),
    });

    expect(res.status).toBe(400);
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
