import { describe, expect, it } from "vitest";

import { validateGraphIntegrity } from "./index.js";

describe("validateGraphIntegrity", () => {
  it("reports a missing edge target", () => {
    const errors = validateGraphIntegrity({
      version: 1,
      nodes: [{ id: "root", title: "Root" }],
      edges: [{ from: "root", to: "missing" }],
    });

    expect(errors).toContain("edge references missing node: missing");
  });
});
