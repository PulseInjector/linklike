import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cliBin = fileURLToPath(new URL("../bin/linklike.mjs", import.meta.url));
const dirs: string[] = [];

async function makeProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "linklike-cli-"));
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
    `${JSON.stringify({ version: 1, entries: {} }, null, 2)}\n`,
  );
  await writeFile(path.join(dir, "nodes", "root.mdx"), "# Root\n");
  return dir;
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("init", () => {
  it("creates a project whose files load through core", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "linklike-cli-init-"));
    dirs.push(parent);
    const dir = path.join(parent, "my-topic");

    const { stdout } = await execFileAsync(process.execPath, [cliBin, "init", dir]);
    expect(stdout).toContain(`Created project at ${dir}`);

    const project = JSON.parse(
      await readFile(path.join(dir, "project.json"), "utf8"),
    ) as {
      name: string;
      version: number;
    };
    expect(project.name).toBe("my-topic");
    expect(project.version).toBe(1);
    expect(await readFile(path.join(dir, "nodes", "root.mdx"), "utf8")).toBe(
      "# my-topic\n\nStart your notes here.\n",
    );
  });

  it("refuses to overwrite an existing project", async () => {
    const dir = await makeProject();
    const before = await readFile(path.join(dir, "project.json"), "utf8");
    await expect(
      execFileAsync(process.execPath, [cliBin, "init", dir]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("already contains a Linklike project"),
    });
    expect(await readFile(path.join(dir, "project.json"), "utf8")).toBe(before);
  });
});

describe("node rename", () => {
  it("updates the graph title and leaves the note file in place", async () => {
    const dir = await makeProject();
    const noteBefore = await readFile(path.join(dir, "nodes", "root.mdx"), "utf8");

    const { stdout } = await execFileAsync(process.execPath, [
      cliBin,
      "node",
      "rename",
      dir,
      "root",
      "--title",
      "Renamed",
    ]);
    expect(stdout).toContain("Renamed root");

    const graph = JSON.parse(
      await readFile(path.join(dir, "plan.graph.json"), "utf8"),
    ) as { nodes: Array<{ id: string; title: string }> };
    expect(graph.nodes).toEqual([{ id: "root", title: "Renamed" }]);
    expect(await readFile(path.join(dir, "nodes", "root.mdx"), "utf8")).toBe(
      noteBefore,
    );
  });
});

describe("node write", () => {
  it("accepts a --body that starts with dashes", async () => {
    const dir = await makeProject();
    await execFileAsync(process.execPath, [
      cliBin,
      "node",
      "write",
      dir,
      "root",
      "--body",
      "---",
    ]);
    expect(await readFile(path.join(dir, "nodes", "root.mdx"), "utf8")).toBe("---");
  });
});
