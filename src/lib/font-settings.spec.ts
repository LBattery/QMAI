import { describe, expect, it } from "vitest"
import {
  DEFAULT_UI_FONT_FAMILY,
  getUiFontFamilyCss,
  normalizeUiFontFamily,
  applyUiFontFamily,
} from "./font-settings"

describe("font settings", () => {
  it("defaults to the local system font and ignores invalid stored values", () => {
    expect(DEFAULT_UI_FONT_FAMILY).toBe("system")
    expect(normalizeUiFontFamily(null)).toBe("system")
    expect(normalizeUiFontFamily("missing-font")).toBe("system")
  })

  it("resolves local machine font options to CSS font-family stacks", () => {
    expect(getUiFontFamilyCss("system")).toContain("system-ui")
    expect(getUiFontFamilyCss("microsoft-yahei")).toContain("Microsoft YaHei")
  })

  it("applies the selected font to the app root CSS variable", () => {
    const values = new Map<string, string>()
    const root = {
      style: {
        setProperty: (key: string, value: string) => values.set(key, value),
      },
    } as unknown as HTMLElement

    applyUiFontFamily("microsoft-yahei", root)

    expect(values.get("--qmai-ui-font-family")).toContain("Microsoft YaHei")
  })
})
