import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const fixtureDir = path.join(repoRoot, "fixtures/minimal-project");
const cliBin = path.join(repoRoot, "packages/cli/bin/linklike.mjs");

async function copyProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "linklike-race-"));
  await cp(fixtureDir, dir, { recursive: true });

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

async function resetProgress(projectDir: string): Promise<void> {
  await writeFile(
    path.join(projectDir, "progress.json"),
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
}

async function raceWriters(projectDir: string): Promise<void> {
  const results = await Promise.allSettled([
    execFileAsync("node", [
      cliBin,
      "progress",
      "set",
      projectDir,
      "root",
      "--status",
      "done",
    ]),
    execFileAsync("node", [
      cliBin,
      "progress",
      "set",
      projectDir,
      "second",
      "--status",
      "skip",
    ]),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      const reason = result.reason as { stderr?: string; message?: string };
      const detail = reason.stderr ?? reason.message ?? String(result.reason);
      if (!detail.includes("Unexpected end of JSON input")) {
        throw result.reason;
      }
    }
  }
}

async function main(): Promise<void> {
  const projectDir = await copyProject();
  let lost = 0;
  const attempts = 100;

  for (let i = 0; i < attempts; i += 1) {
    await resetProgress(projectDir);
    await raceWriters(projectDir);

    const progress = JSON.parse(
      await readFile(path.join(projectDir, "progress.json"), "utf8"),
    ) as { entries: Record<string, { status: string }> };

    const rootOk = progress.entries.root?.status === "done";
    const secondOk = progress.entries.second?.status === "skip";
    if (!rootOk || !secondOk) {
      lost += 1;
      console.log(
        `attempt ${i + 1}: lost update — root=${progress.entries.root?.status ?? "missing"}, second=${progress.entries.second?.status ?? "missing"}`,
      );
    }
  }

  console.log(`\nRace attempts: ${attempts}, lost updates: ${lost}`);
  if (lost > 0) {
    console.error("REPRODUCED: concurrent progress writes can drop updates.");
    process.exitCode = 1;
  } else {
    console.log("No lost updates in this run (race is timing-dependent; try again).");
  }
}

void main();
