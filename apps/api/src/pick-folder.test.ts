import { describe, expect, it } from "vitest";

import {
  normalizePickedPath,
  pickFolderNative,
  type ExecFolderPicker,
} from "./pick-folder.js";

describe("normalizePickedPath", () => {
  it("strips a trailing slash except for filesystem roots", () => {
    expect(normalizePickedPath("/Users/me/topic/\n")).toBe("/Users/me/topic");
    expect(normalizePickedPath("/")).toBe("/");
    expect(normalizePickedPath("C:\\Users\\me\\topic\\")).toBe("C:\\Users\\me\\topic");
    expect(normalizePickedPath("C:\\")).toBe("C:\\");
  });
});

describe("pickFolderNative", () => {
  it("returns the path from osascript on macOS", async () => {
    const exec: ExecFolderPicker = async (file, args) => {
      expect(file).toBe("osascript");
      expect(args.join(" ")).toContain("choose folder");
      return { stdout: "/Users/me/learning/\n", stderr: "" };
    };
    await expect(pickFolderNative("darwin", exec)).resolves.toEqual({
      ok: true,
      path: "/Users/me/learning",
    });
  });

  it("treats osascript user cancel as cancelled", async () => {
    const exec: ExecFolderPicker = async () => {
      const error = new Error("User canceled.") as Error & { code: number };
      error.code = 1;
      throw error;
    };
    await expect(pickFolderNative("darwin", exec)).resolves.toEqual({
      ok: false,
      reason: "cancelled",
    });
  });

  it("treats zenity exit 1 as cancelled", async () => {
    const exec: ExecFolderPicker = async (file, args) => {
      expect(file).toBe("zenity");
      expect(args).toContain("--file-selection");
      expect(args).toContain("--directory");
      const error = new Error("canceled") as Error & { code: number };
      error.code = 1;
      throw error;
    };
    await expect(pickFolderNative("linux", exec)).resolves.toEqual({
      ok: false,
      reason: "cancelled",
    });
  });

  it("treats a missing zenity binary as unavailable", async () => {
    const exec: ExecFolderPicker = async () => {
      const error = new Error("not found") as Error & { code: string };
      error.code = "ENOENT";
      throw error;
    };
    await expect(pickFolderNative("linux", exec)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("runs the Vista folder picker script on Windows", async () => {
    const exec: ExecFolderPicker = async (file, args) => {
      expect(file).toBe("powershell.exe");
      expect(args).toContain("-STA");
      expect(args.some((arg) => arg.includes("FOS_PICKFOLDERS"))).toBe(true);
      expect(args.some((arg) => arg.includes("$Result -eq 0"))).toBe(true);
      expect(args.some((arg) => arg.includes("DialogResult"))).toBe(false);
      expect(args.some((arg) => arg.includes("FolderBrowserDialog"))).toBe(false);
      return { stdout: "C:\\Users\\me\\topic\r\n", stderr: "" };
    };
    await expect(pickFolderNative("win32", exec)).resolves.toEqual({
      ok: true,
      path: "C:\\Users\\me\\topic",
    });
  });

  it("treats empty Windows output as cancelled", async () => {
    const exec: ExecFolderPicker = async () => ({ stdout: "\r\n", stderr: "" });
    await expect(pickFolderNative("win32", exec)).resolves.toEqual({
      ok: false,
      reason: "cancelled",
    });
  });

  it("does not treat Windows exit 1 as cancelled", async () => {
    const exec: ExecFolderPicker = async () => {
      const error = new Error("reflection failed") as Error & { code: number };
      error.code = 1;
      throw error;
    };
    await expect(pickFolderNative("win32", exec)).rejects.toThrow("reflection failed");
  });
});
