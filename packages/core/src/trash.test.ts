import path from "node:path";

import { describe, expect, it } from "vitest";

import { escapePosixForAppleScript } from "./trash.js";

describe("escapePosixForAppleScript", () => {
  it("escapes backslashes instead of turning them into slashes", () => {
    const posix = escapePosixForAppleScript(`${path.sep}tmp${path.sep}a\\b`);
    expect(posix).toContain("a\\\\b");
    expect(posix).not.toMatch(/a\/b/);
  });
});
