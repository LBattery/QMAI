import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(resolve(__dirname, "outline-editor.tsx"), "utf8")

describe("OutlineCreatorDialog", () => {
  it("不保留非 AI 大纲对话式的大纲生成入口", () => {
    expect(source).not.toContain("streamChat")
    expect(source).not.toContain("PROMPTS.outlineGeneration")
    expect(source).not.toContain("novel.outline.useAi")
    expect(source).not.toContain("createWithAi")
    expect(source).not.toContain("setUseAi")
  })
})
