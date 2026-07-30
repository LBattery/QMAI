import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(resolve(__dirname, "outline-action-toolbar.tsx"), "utf8")

describe("OutlineActionToolbar", () => {
  it("toggles the AI outline panel instead of only opening it", () => {
    expect(source).toContain("outlineChatOpen")
    expect(source).toContain("setOutlineChatOpen(!outlineChatOpen)")
    expect(source).toContain('aria-pressed={outlineChatOpen}')
  })
})
