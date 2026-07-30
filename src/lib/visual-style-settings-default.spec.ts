import { describe, expect, it } from "vitest"
import { DEFAULT_VISUAL_STYLE, normalizeVisualStyle } from "./visual-style-settings"

describe("visual-style-settings default", () => {
  it("uses fangzheng as the default visual style for new users", () => {
    expect(DEFAULT_VISUAL_STYLE).toBe("fangzheng")
    expect(normalizeVisualStyle("bad")).toBe("fangzheng")
    expect(normalizeVisualStyle(null)).toBe("fangzheng")
  })
})
