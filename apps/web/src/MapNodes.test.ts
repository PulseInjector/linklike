import { describe, expect, it } from "vitest";

import { isComposingKey } from "./MapNodes";

describe("isComposingKey", () => {
  it("ignores Enter while an IME composition is active", () => {
    expect(isComposingKey({ nativeEvent: { isComposing: true, keyCode: 13 } })).toBe(
      true,
    );
    expect(isComposingKey({ nativeEvent: { isComposing: false, keyCode: 229 } })).toBe(
      true,
    );
    expect(isComposingKey({ nativeEvent: { isComposing: false, keyCode: 13 } })).toBe(
      false,
    );
  });
});
