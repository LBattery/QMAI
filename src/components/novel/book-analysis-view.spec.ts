import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const source = readFileSync("src/components/novel/book-analysis-view.tsx", "utf8")

describe("BookAnalysisView 三栏资源库接入", () => {
  it("把拆书库主界面接入三栏资源库，同时保留旧结果查看器兼容入口", () => {
    expect(source).toContain("BookAnalysisLibraryLayout")
    expect(source).toContain("loadBookAnalysisLibraryState")
    expect(source).toContain("toBookAnalysisResult")
    expect(source).toContain("BookAnalysisResultViewer")
    expect(source).toContain("setCurrentResult(toBookAnalysisResult")
  })
})
