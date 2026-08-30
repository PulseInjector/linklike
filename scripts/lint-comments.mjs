import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scanRoots = ["apps", "packages"].map((dir) => path.join(repoRoot, dir));
const extensions = new Set([".ts", ".tsx"]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    if (extensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function findBlockCommentViolations(content, filePath) {
  const violations = [];
  const lines = content.split("\n");
  let inBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNo = index + 1;

    if (inBlock) {
      if (line.includes("*/")) {
        inBlock = false;
      }
      continue;
    }

    const blockStart = line.indexOf("/*");
    if (blockStart === -1) {
      continue;
    }

    const before = line.slice(0, blockStart);
    if (before.includes('"') || before.includes("'") || before.includes("`")) {
      continue;
    }

    violations.push({
      filePath,
      lineNo,
      message: "Block comments are not allowed; use // for non-obvious why.",
    });
    if (!line.includes("*/")) {
      inBlock = true;
    }
  }

  return violations;
}

const files = [];
for (const root of scanRoots) {
  files.push(...(await walk(root)));
}

const violations = [];
for (const filePath of files) {
  const content = await readFile(filePath, "utf8");
  violations.push(...findBlockCommentViolations(content, filePath));
}

if (violations.length > 0) {
  for (const violation of violations) {
    const relative = path.relative(repoRoot, violation.filePath);
    console.error(`${relative}:${violation.lineNo}: ${violation.message}`);
  }
  console.error(
    `\nlint:comments failed with ${violations.length} violation(s). See AGENTS.md § Comments.`,
  );
  process.exitCode = 1;
}
