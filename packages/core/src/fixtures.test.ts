import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runCore, validateProjectDir } from "./index.js";

describe("committed fixtures", () => {
  it("validates fixtures/reference-map", async () => {
    const dir = fileURLToPath(
      new URL("../../../fixtures/reference-map", import.meta.url),
    );
    const result = await runCore(validateProjectDir(dir));
    expect(result).toEqual({ ok: true, issues: [] });
  });
});
