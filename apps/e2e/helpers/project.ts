import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDir = fileURLToPath(
  new URL("../../../fixtures/minimal-project", import.meta.url),
);

export async function copyMinimalProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "linklike-e2e-"));
  await cp(fixtureDir, dir, { recursive: true });
  return dir;
}

export async function copyTwoNodeProject(): Promise<string> {
  const dir = await copyMinimalProject();

  const graphPath = path.join(dir, "plan.graph.json");
  const graph = JSON.parse(await readFile(graphPath, "utf8")) as {
    version: number;
    nodes: Array<{ id: string; title: string }>;
    edges: Array<{ from: string; to: string }>;
  };
  graph.nodes.push({ id: "second", title: "Second topic" });
  graph.edges.push({ from: "root", to: "second" });
  await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);

  const progressPath = path.join(dir, "progress.json");
  const progress = JSON.parse(await readFile(progressPath, "utf8")) as {
    version: number;
    entries: Record<string, { status: string }>;
  };
  progress.entries.second = { status: "learning" };
  await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);

  await mkdir(path.join(dir, "nodes"), { recursive: true });
  await writeFile(
    path.join(dir, "nodes", "second.mdx"),
    "# Second topic\n\nFollow-up material.\n",
  );

  return dir;
}

export async function writeNodeMarkdown(
  projectDir: string,
  nodeId: string,
  markdown: string,
): Promise<void> {
  await writeFile(path.join(projectDir, "nodes", `${nodeId}.mdx`), markdown);
}

export async function corruptProjectJson(projectDir: string): Promise<void> {
  await writeFile(path.join(projectDir, "project.json"), "{ not valid json\n");
}

export async function repairProjectJson(projectDir: string): Promise<void> {
  await writeFile(
    path.join(projectDir, "project.json"),
    `${JSON.stringify(
      {
        version: 1,
        name: "minimal",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      null,
      2,
    )}\n`,
  );
}

export async function readProgressFile(projectDir: string): Promise<{
  entries: Record<string, { status: string }>;
}> {
  const raw = await readFile(path.join(projectDir, "progress.json"), "utf8");
  return JSON.parse(raw) as { entries: Record<string, { status: string }> };
}

export async function setProjectName(projectDir: string, name: string): Promise<void> {
  const projectPath = path.join(projectDir, "project.json");
  const project = JSON.parse(await readFile(projectPath, "utf8")) as {
    version: number;
    name: string;
    createdAt: string;
  };
  project.name = name;
  await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`);
}
