import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  addNode,
  deleteNode,
  initProjectDir,
  isLinklikeError,
  linklikeErrorMessage,
  renameNode,
  runCore,
  setProgress,
  validateProjectDir,
  writeNodeContent,
} from "@linklike/core";
import { PROGRESS_WRITE_STATUSES } from "@linklike/protocol";

function usage(): void {
  console.log(`linklike — local learning map

Usage:
  linklike init <directory>
  linklike validate <directory> [--json]
  linklike progress set <directory> <nodeId> --status <${PROGRESS_WRITE_STATUSES.join("|")}>
  linklike node add <directory> --title <title> [--parent <nodeId>]
  linklike node rename <directory> <nodeId> --title <title>
  linklike node delete <directory> <nodeId>
  linklike node write <directory> <nodeId> [--body <markdown>]
`);
}

function parseFlag(
  args: string[],
  flag: string,
  allowLeadingDashes = false,
): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (value === undefined || (!allowLeadingDashes && value.startsWith("--"))) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
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
    const resolved = path.resolve(target);
    // Core refuses a missing path so the browser cannot mkdir; CLI still creates it.
    await mkdir(resolved, { recursive: true });
    await runCore(initProjectDir(resolved));
    console.log(`Created project at ${resolved}`);
    return;
  }

  if (command === "validate") {
    const json = rest.includes("--json");
    const target = rest.find((arg) => !arg.startsWith("-"));
    if (!target) {
      throw new Error("validate requires a directory path");
    }
    const result = await runCore(validateProjectDir(path.resolve(target)));
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
    const result = await runCore(addNode(path.resolve(target), { title, parent }));
    console.log(`Added node ${result.id}`);
    if (parent) {
      console.log(`Linked ${parent} → ${result.id}`);
    }
    if (result.nodeFileCreated) {
      console.log(`Created nodes/${result.id}.mdx`);
    }
    return;
  }

  if (command === "node" && rest[0] === "rename") {
    const target = rest[1];
    const nodeId = rest[2];
    const title = parseFlag(rest, "--title");
    if (!target || !nodeId || !title) {
      throw new Error(
        "usage: linklike node rename <directory> <nodeId> --title <title>",
      );
    }
    const result = await runCore(renameNode(path.resolve(target), nodeId, title));
    console.log(`Renamed ${result.id}`);
    return;
  }

  if (command === "node" && rest[0] === "delete") {
    const target = rest[1];
    const nodeId = rest[2];
    if (!target || !nodeId) {
      throw new Error("usage: linklike node delete <directory> <nodeId>");
    }
    const result = await runCore(deleteNode(path.resolve(target), nodeId));
    console.log(`Deleted ${result.deletedIds.join(", ")}`);
    return;
  }

  if (command === "node" && rest[0] === "write") {
    const target = rest[1];
    const nodeId = rest[2];
    if (!target || !nodeId) {
      throw new Error(
        "usage: linklike node write <directory> <nodeId> [--body <markdown>]",
      );
    }
    const flagged = parseFlag(rest, "--body", true);
    let body: string;
    if (flagged !== undefined) {
      body = flagged;
    } else if (process.stdin.isTTY) {
      throw new Error(
        "usage: linklike node write <directory> <nodeId> [--body <markdown>]",
      );
    } else {
      body = await readStdin();
    }
    await runCore(writeNodeContent(path.resolve(target), nodeId, body));
    console.log(`Wrote nodes/${nodeId}.mdx`);
    return;
  }

  if (command === "progress" && rest[0] === "set") {
    const target = rest[1];
    const nodeId = rest[2];
    const status = parseFlag(rest, "--status");
    if (!target || !nodeId || !status) {
      throw new Error(
        "usage: linklike progress set <directory> <nodeId> --status learning|done|skip|pending",
      );
    }
    await runCore(setProgress(path.resolve(target), nodeId, status));
    console.log(
      status === "pending" ? `Cleared ${nodeId}` : `Set ${nodeId} → ${status}`,
    );
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  if (isLinklikeError(error)) {
    console.error(linklikeErrorMessage(error));
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
});
