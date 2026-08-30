import { execFile } from "node:child_process";
import { cp, mkdtemp, open, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const fixtureDir = path.join(repoRoot, "fixtures/minimal-project");
const cliBin = path.join(repoRoot, "packages/cli/bin/linklike.mjs");
const LOCK_FILE = ".linklike.lock";
const TORN_GRAPH = '{"version":1,"nodes":[{"id":"root","title":"Minimal';
const HOLD_TORN_MS = 800;

function isGraphReadFailure(stderr: string): boolean {
  return /JSON|parse|Unexpected end|plan\.graph/i.test(stderr);
}

async function copyProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "linklike-graph-race-"));
  await cp(fixtureDir, dir, { recursive: true });
  return dir;
}

async function resetGraph(projectDir: string): Promise<void> {
  await writeFile(
    path.join(projectDir, "plan.graph.json"),
    `${JSON.stringify(
      {
        version: 1,
        nodes: [{ id: "root", title: "Minimal example" }],
        edges: [],
      },
      null,
      2,
    )}\n`,
  );
  await unlink(path.join(projectDir, LOCK_FILE)).catch(() => undefined);
}

async function holdTornGraph(projectDir: string): Promise<() => Promise<void>> {
  const graphPath = path.join(projectDir, "plan.graph.json");
  const lockPath = path.join(projectDir, LOCK_FILE);
  const complete = await readFile(graphPath, "utf8");
  const handle = await open(lockPath, "wx");
  await handle.writeFile("race");
  await writeFile(graphPath, TORN_GRAPH);

  let released = false;
  return async () => {
    if (released) {
      return;
    }
    released = true;
    await writeFile(graphPath, complete);
    await handle.close();
    await unlink(lockPath).catch(() => undefined);
  };
}

async function raceWriters(projectDir: string): Promise<boolean> {
  const release = await holdTornGraph(projectDir);
  let sawFailure = false;

  try {
    const cliRace = Promise.allSettled([
      execFileAsync("node", [
        cliBin,
        "node",
        "add",
        projectDir,
        "--title",
        "Race topic",
        "--parent",
        "root",
      ]),
      execFileAsync("node", [
        cliBin,
        "progress",
        "set",
        projectDir,
        "root",
        "--status",
        "done",
      ]),
    ]);

    // Leave the graph torn long enough that an unlocked setProgress read would see it.
    await new Promise((resolve) => setTimeout(resolve, HOLD_TORN_MS));
    await release();

    const results = await cliRace;
    for (const result of results) {
      if (result.status === "rejected") {
        const reason = result.reason as { stderr?: string; message?: string };
        const detail = reason.stderr ?? reason.message ?? String(result.reason);
        if (isGraphReadFailure(detail)) {
          sawFailure = true;
          console.log("graph read failure:", detail.trim().split("\n").pop());
        }
      }
    }
  } finally {
    await release();
  }

  return sawFailure;
}

async function main(): Promise<void> {
  const projectDir = await copyProject();
  const attempts = 30;
  let reproduced = 0;

  for (let i = 0; i < attempts; i += 1) {
    await resetGraph(projectDir);
    if (await raceWriters(projectDir)) {
      reproduced += 1;
    }
  }

  console.log(`Attempts: ${attempts}, graph read failures: ${reproduced}`);
  if (reproduced > 0) {
    console.error(
      "REPRODUCED: setProgress read plan.graph.json outside the project lock while graph was mutating.",
    );
    process.exitCode = 1;
  } else {
    console.log(
      "No graph read failures in this run (try again or increase attempts; race is timing-dependent).",
    );
  }
}

void main();
