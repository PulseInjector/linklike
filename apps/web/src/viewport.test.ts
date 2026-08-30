import { describe, expect, it } from "vitest";

import { MIN_ZOOM, OPENING_PAD, READABLE_ZOOM, openingViewport } from "./viewport";

describe("openingViewport", () => {
  const pane = { width: 1200, height: 800 };

  it("centers a map that fits at readable zoom", () => {
    const vp = openingViewport({ x: 0, y: 0, width: 400, height: 300 }, pane);
    expect(vp.zoom).toBe(READABLE_ZOOM);
    expect(vp.x).toBe((pane.width - 400) / 2);
    expect(vp.y).toBe((pane.height - 300) / 2);
  });

  it("pins a tall map to the top instead of shrinking past readable zoom", () => {
    const vp = openingViewport({ x: 100, y: 40, width: 600, height: 20_000 }, pane);
    expect(vp.zoom).toBe(READABLE_ZOOM);
    expect(vp.y).toBe(OPENING_PAD - 40);
    expect(vp.x).toBe((pane.width - 600) / 2 - 100);
  });

  it("shrinks only enough to fit width, never below MIN_ZOOM", () => {
    const wide = openingViewport({ x: 0, y: 0, width: 10_000, height: 400 }, pane);
    expect(wide.zoom).toBeCloseTo((pane.width - OPENING_PAD * 2) / 10_000);
    expect(wide.zoom).toBeGreaterThan(MIN_ZOOM);

    const huge = openingViewport({ x: 0, y: 0, width: 1_000_000, height: 400 }, pane);
    expect(huge.zoom).toBe(MIN_ZOOM);
  });
});
