import { describe, expect, it } from "vitest"
import {
  buildAnalysisChunkPlan,
  computeAnalysisChunkCharLimit,
  validateAnalysisRange,
} from "./analysis-chunk-planner"

const chapters = Array.from({ length: 120 }, (_, index) => ({
  id: `ch-${String(index + 1).padStart(4, "0")}`,
  order: index + 1,
  wordCount: index === 14 ? 50000 : 2000,
}))

describe("analysis chunk planner", () => {
  it("拒绝无效范围和超过 100 章的单次任务", () => {
    expect(() => validateAnalysisRange(chapters, { startOrder: 0, endOrder: 10 }))
      .toThrow("起始章节")
    expect(() => validateAnalysisRange(chapters, { startOrder: 20, endOrder: 10 }))
      .toThrow("结束章节")
    expect(() => validateAnalysisRange(chapters, { startOrder: 1, endOrder: 101 }))
      .toThrow("单次最多分析 100 章")
  })

  it("拒绝包含缺失章节的范围", () => {
    const withGap = chapters.filter((chapter) => chapter.order !== 12)

    expect(() => validateAnalysisRange(withGap, { startOrder: 10, endOrder: 15 }))
      .toThrow("未找到第 12 章")
  })

  it("默认每 10 章切块并把超长章节单独成块", () => {
    const plan = buildAnalysisChunkPlan(
      chapters,
      { startOrder: 1, endOrder: 30 },
      { targetChapterCount: 10, maxChunkChars: 40000 },
    )

    expect(plan.flatMap((chunk) => chunk.chapterIds)).toHaveLength(30)
    expect(plan.some((chunk) => (
      chunk.chapterIds.length === 1
      && chunk.startOrder === 15
      && chunk.endOrder === 15
    ))).toBe(true)
    expect(plan.every((chunk) => chunk.chapterIds.length <= 10)).toBe(true)
  })

  it("按模型上下文计算保守字数上限", () => {
    expect(computeAnalysisChunkCharLimit(10000)).toBe(8000)
    expect(computeAnalysisChunkCharLimit(60000)).toBe(27000)
    expect(computeAnalysisChunkCharLimit(200000)).toBe(40000)
  })
})
