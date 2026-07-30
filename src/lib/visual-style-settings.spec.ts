import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  VISUAL_STYLE_STORAGE_VERSION,
  applyVisualStyle,
  normalizeVisualStyle,
  resolveStoredVisualStyle,
} from "./visual-style-settings"

describe("visual-style-settings", () => {
  beforeEach(() => {
    const classes = new Set<string>()
    vi.stubGlobal("document", {
      documentElement: {
        classList: {
          add: (...names: string[]) => names.forEach((name) => classes.add(name)),
          remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
          contains: (name: string) => classes.has(name),
        },
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("falls back to fangzheng for invalid values", () => {
    expect(normalizeVisualStyle("bad")).toBe("fangzheng")
    expect(normalizeVisualStyle(null)).toBe("fangzheng")
  })

  it("accepts all oriental visual styles", () => {
    expect(normalizeVisualStyle("classic")).toBe("classic")
    expect(normalizeVisualStyle("fangzheng")).toBe("fangzheng")
    expect(normalizeVisualStyle("tianqing")).toBe("tianqing")
    expect(normalizeVisualStyle("qingci")).toBe("qingci")
    expect(normalizeVisualStyle("yunshan")).toBe("yunshan")
    expect(normalizeVisualStyle("cangzhu")).toBe("cangzhu")
    expect(normalizeVisualStyle("yuebai")).toBe("yuebai")
    expect(normalizeVisualStyle("gumo")).toBe("gumo")
  })

  it("toggles the selected visual style class", () => {
    applyVisualStyle("cangzhu")
    expect(document.documentElement.classList.contains("visual-cangzhu")).toBe(true)

    applyVisualStyle("classic")
    expect(document.documentElement.classList.contains("visual-cangzhu")).toBe(false)
  })

  it("keeps only one visual style class at a time", () => {
    applyVisualStyle("tianqing")
    applyVisualStyle("gumo")

    expect(document.documentElement.classList.contains("visual-tianqing")).toBe(false)
    expect(document.documentElement.classList.contains("visual-gumo")).toBe(true)
  })

  it("migrates legacy saved styles to the compact square style once", () => {
    expect(resolveStoredVisualStyle("yuebai", null)).toBe("fangzheng")
    expect(resolveStoredVisualStyle("cangzhu", "old-version")).toBe("fangzheng")
  })

  it("keeps user-selected styles after the current visual style version is stored", () => {
    expect(resolveStoredVisualStyle("yuebai", VISUAL_STYLE_STORAGE_VERSION)).toBe("yuebai")
    expect(resolveStoredVisualStyle("classic", VISUAL_STYLE_STORAGE_VERSION)).toBe("classic")
  })
})
