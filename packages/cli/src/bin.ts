import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { addNode, setProgress, validateProjectDir } from "@linklike/core";
import { PROGRESS_STATUSES } from "@linklike/protocol";

function usage(): void {
  console.log(`linklike — local learning map

Usage:
  linklike init <directory>
  linklike validate <directory> [--json]
  linklike progress set <directory> <nodeId> --status <${PROGRESS_STATUSES.join("|")}>
  linklike node add <directory> --title <title> [--parent <nodeId>]
`);
}

function parseFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

async function initProject(targetDir: string): Promise<void> {
  await mkdir(path.join(targetDir, "nodes"), { recursive: true });

  const now = new Date().toISOString();
  const name = path.basename(targetDir);

  await writeFile(
    path.join(targetDir, "project.json"),
    `${JSON.stringify({ version: 1, name, createdAt: now }, null, 2)}\n`,
  );

  await writeFile(
    path.join(targetDir, "plan.graph.json"),
    `${JSON.stringify(
      {
        version: 1,
        nodes: [{ id: "root", title: name }],
        edges: [],
      },
      null,
      2,
    )}\n`,
  );

  await writeFile(
    path.join(targetDir, "progress.json"),
    `${JSON.stringify({ version: 1, entries: { root: { status: "learning" } } }, null, 2)}\n`,
  );

  await writeFile(
    path.join(targetDir, "nodes", "root.mdx"),
    `# ${name}\n\nStart your notes here.\n`,
  );

  console.log(`Created project at ${targetDir}`);
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }

  if (command === "init") {
    const target = rest[0];
    if (!target) {
      throw new Error("init requires a directory path");
    }
    await initProject(path.resolve(target));
    return;
  }

  if (command === "validate") {
    const json = rest.includes("--json");
    const target = rest.find((arg) => !arg.startsWith("-"));
    if (!target) {
      throw new Error("validate requires a directory path");
    }
    const result = await validateProjectDir(path.resolve(target));
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.ok) {
      console.log("OK");
    } else {
      for (const issue of result.issues) {
        console.error(`${issue.code}: ${issue.message}`);
      }
    }
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "node" && rest[0] === "add") {
    const target = rest[1];
    const title = parseFlag(rest, "--title");
    const parent = parseFlag(rest, "--parent");
    if (!target || !title) {
      throw new Error(
        "usage: linklike node add <directory> --title <title> [--parent <nodeId>]",
      );
    }
    const result = await addNode(path.resolve(target), { title, parent });
    console.log(`Added node ${result.id}`);
    if (parent) {
      console.log(`Linked ${parent} → ${result.id}`);
    }
    if (result.nodeFileCreated) {
      console.log(`Created nodes/${result.id}.mdx`);
    }
    return;
  }

  if (command === "progress" && rest[0] === "set") {
    const target = rest[1];
    const nodeId = rest[2];
    const status = parseFlag(rest, "--status");
    if (!target || !nodeId || !status) {
      throw new Error(
        "usage: linklike progress set <directory> <nodeId> --status learning|done|skip",
      );
    }
    await setProgress(path.resolve(target), nodeId, status);
    console.log(`Set ${nodeId} → ${status}`);
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
