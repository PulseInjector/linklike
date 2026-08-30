import { access, copyFile, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { Effect } from "effect";

import { IoError } from "./errors.js";

const execFileAsync = promisify(execFile);

function xdgDataHome(): string {
  return process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local", "share");
}

async function uniqueName(dir: string, base: string): Promise<string> {
  let candidate = base;
  let suffix = 1;
  for (;;) {
    try {
      await access(path.join(dir, candidate));
    } catch {
      return candidate;
    }
    suffix += 1;
    candidate = `${base} ${suffix}`;
  }
}

async function xdgTrash(filePath: string): Promise<void> {
  const trashRoot = path.join(xdgDataHome(), "Trash");
  const filesDir = path.join(trashRoot, "files");
  const infoDir = path.join(trashRoot, "info");
  await mkdir(filesDir, { recursive: true });
  await mkdir(infoDir, { recursive: true });

  const destName = await uniqueName(filesDir, path.basename(filePath));
  const destPath = path.join(filesDir, destName);
  try {
    await rename(filePath, destPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // Cross-device rename cannot move; copy into Trash then remove the original.
    if (code === "EXDEV") {
      await copyFile(filePath, destPath);
      await unlink(filePath);
    } else {
      throw error;
    }
  }

  const deleted = new Date().toISOString().slice(0, 19);
  const info = `[Trash Info]\nPath=${encodeURI(path.resolve(filePath))}\nDeletionDate=${deleted}\n`;
  await writeFile(path.join(infoDir, `${destName}.trashinfo`), info);
}

async function darwinTrash(filePath: string): Promise<void> {
  const posix = path.resolve(filePath).replaceAll("\\", "/").replaceAll('"', '\\"');
  await execFileAsync("osascript", [
    "-e",
    `tell application "Finder" to delete POSIX file "${posix}"`,
  ]);
}

async function windowsTrash(filePath: string): Promise<void> {
  const resolved = path.resolve(filePath).replaceAll("'", "''");
  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${resolved}', 'OnlyErrorDialogs', 'SendToRecycleBin')`,
  ]);
}

export const moveToOsTrash = (filePath: string): Effect.Effect<void, IoError> =>
  Effect.tryPromise({
    try: async () => {
      if (process.platform === "darwin") {
        await darwinTrash(filePath);
        return;
      }
      if (process.platform === "win32") {
        await windowsTrash(filePath);
        return;
      }
      await xdgTrash(filePath);
    },
    catch: (cause) => new IoError({ operation: `trash ${filePath}`, cause }),
  });
