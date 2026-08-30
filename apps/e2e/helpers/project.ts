import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const fixtureDir = fileURLToPath(
  new URL("../../../fixtures/minimal-project", import.meta.url),
);

const referenceDir = fileURLToPath(
  new URL("../../../fixtures/reference-map", import.meta.url),
);

const cliBin = fileURLToPath(
  new URL("../../../packages/cli/bin/linklike.mjs", import.meta.url),
);

export async function copyMinimalProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "linklike-e2e-"));
  await cp(fixtureDir, dir, { recursive: true });
  return dir;
}

export async function copyReferenceMap(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "linklike-e2e-"));
  await cp(referenceDir, dir, { recursive: true });
  return dir;
}

export async function copyTwoNodeProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "linklike-e2e-"));
  await mkdir(path.join(dir, "nodes"), { recursive: true });

  await writeFile(
    path.join(dir, "project.json"),
    `${JSON.stringify(
      {
        version: 1,
        name: "two-node",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      null,
      2,
    )}\n`,
  );

  await writeFile(
    path.join(dir, "plan.graph.json"),
    `${JSON.stringify(
      {
        version: 1,
        nodes: [
          { id: "root", title: "Minimal example" },
          { id: "second", title: "Second topic" },
        ],
        edges: [{ from: "root", to: "second" }],
      },
      null,
      2,
    )}\n`,
  );

  await writeFile(
    path.join(dir, "progress.json"),
    `${JSON.stringify(
      {
        version: 1,
        entries: {
          root: { status: "learning" },
          second: { status: "learning" },
        },
      },
      null,
      2,
    )}\n`,
  );

  await writeFile(
    path.join(dir, "nodes", "root.mdx"),
    "# Minimal example\n\nFixture project for e2e.\n",
  );
  await writeFile(
    path.join(dir, "nodes", "second.mdx"),
    "# Second topic\n\nFollow-up material.\n",
  );

  return dir;
}

export async function copySingleNodeProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "linklike-e2e-"));
  await mkdir(path.join(dir, "nodes"), { recursive: true });
  await writeFile(
    path.join(dir, "project.json"),
    `${JSON.stringify(
      { version: 1, name: "one-node", createdAt: "2026-01-01T00:00:00.000Z" },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(dir, "plan.graph.json"),
    `${JSON.stringify(
      { version: 1, nodes: [{ id: "root", title: "Only node" }], edges: [] },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(dir, "progress.json"),
    `${JSON.stringify({ version: 1, entries: {} }, null, 2)}\n`,
  );
  await writeFile(path.join(dir, "nodes", "root.mdx"), "# Only node\n");
  return dir;
}

export async function copyThreeNodeProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "linklike-e2e-"));
  await mkdir(path.join(dir, "nodes"), { recursive: true });
  const nodes = [
    { id: "root", title: "Root topic" },
    { id: "parent", title: "Parent topic" },
    { id: "child", title: "Child topic" },
  ];
  const edges = [
    { from: "root", to: "parent" },
    { from: "parent", to: "child" },
  ];
  await writeFile(
    path.join(dir, "project.json"),
    `${JSON.stringify(
      { version: 1, name: "three-node", createdAt: "2026-01-01T00:00:00.000Z" },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(dir, "plan.graph.json"),
    `${JSON.stringify({ version: 1, nodes, edges }, null, 2)}\n`,
  );
  await writeFile(
    path.join(dir, "progress.json"),
    `${JSON.stringify(
      {
        version: 1,
        entries: {
          parent: { status: "learning" },
          child: { status: "done" },
        },
      },
      null,
      2,
    )}\n`,
  );
  for (const node of nodes) {
    await writeFile(
      path.join(dir, "nodes", `${node.id}.mdx`),
      `# ${node.title}\n\nNotes.\n`,
    );
  }
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

export async function addNodeViaCli(
  projectDir: string,
  title: string,
  parent: string,
): Promise<void> {
  await execFileAsync(process.execPath, [
    cliBin,
    "node",
    "add",
    projectDir,
    "--title",
    title,
    "--parent",
    parent,
  ]);
}

export async function readGraphFile(projectDir: string): Promise<{
  nodes: Array<Record<string, unknown>>;
  edges: Array<{ from: string; to: string }>;
}> {
  const raw = await readFile(path.join(projectDir, "plan.graph.json"), "utf8");
  return JSON.parse(raw) as {
    nodes: Array<Record<string, unknown>>;
    edges: Array<{ from: string; to: string }>;
  };
}

export async function copySpineProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "linklike-e2e-"));
  await mkdir(path.join(dir, "nodes"), { recursive: true });
  const nodes = [
    { id: "root", title: "Data Engineer" },
    { id: "introduction", title: "Introduction" },
    { id: "what-is-data-engineering", title: "What is Data Engineering?" },
    { id: "skills", title: "Skills and Responsibilities" },
    { id: "lifecycle", title: "Data Engineering Lifecycle" },
    { id: "learn-the-basics", title: "Learn the Basics" },
    { id: "python", title: "Python" },
    { id: "java", title: "Java" },
    { id: "scala", title: "Scala" },
  ];
  const edges = [
    { from: "root", to: "introduction" },
    { from: "introduction", to: "what-is-data-engineering" },
    { from: "introduction", to: "skills" },
    { from: "introduction", to: "lifecycle" },
    { from: "root", to: "learn-the-basics" },
    { from: "learn-the-basics", to: "python" },
    { from: "learn-the-basics", to: "java" },
    { from: "learn-the-basics", to: "scala" },
  ];

  await writeFile(
    path.join(dir, "project.json"),
    `${JSON.stringify(
      { version: 1, name: "spine", createdAt: "2026-01-01T00:00:00.000Z" },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(dir, "plan.graph.json"),
    `${JSON.stringify({ version: 1, nodes, edges }, null, 2)}\n`,
  );
  await writeFile(
    path.join(dir, "progress.json"),
    `${JSON.stringify({ version: 1, entries: {} }, null, 2)}\n`,
  );
  for (const node of nodes) {
    await writeFile(
      path.join(dir, "nodes", `${node.id}.mdx`),
      `# ${node.title}\n\nStart your notes here.\n`,
    );
  }
  return dir;
}
