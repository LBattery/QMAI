import { describe, expect, it } from "vitest"
import type { AnalysisEvidenceSnippet } from "./analysis-pipeline-types"
import {
  buildBookAnalysisContextIndex,
  searchBookAnalysisContextIndex,
} from "./analysis-context-index"

function snippet(id: string, enabled: boolean): AnalysisEvidenceSnippet {
  return {
    version: 1,
    id,
    bookId: "book-1",
    skill: "style",
    taskId: "analysis-1",
    chapterId: "ch-0008",
    chapterOrder: 8,
    text: enabled ? "一本正经地补刀，形成幽默反差。" : "已禁用片段不应出现。",
    tags: ["幽默对白"],
    reason: "反差制造笑点",
    purpose: "对白节奏",
    enabled,
    userPinned: false,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe("analysis context index", () => {
  it("只索引启用片段并按任务检索作品分析", () => {
    const index = buildBookAnalysisContextIndex([{
      bookId: "book-1",
      title: "轻松修仙录",
      modules: [{
        skill: "style",
        summary: "以严肃口吻制造反差幽默",
        range: { startOrder: 1, endOrder: 20 },
        updatedAt: 10,
      }],
      evidence: [snippet("enabled", true), snippet("disabled", false)],
    }], 20)

    const result = searchBookAnalysisContextIndex(index, "按轻松修仙录的幽默对白写一段")

    expect(result).toContain("轻松修仙录")
    expect(result).toContain("幽默对白")
    expect(result).toContain("一本正经地补刀")
    expect(result).not.toContain("已禁用片段")
  })

  it("无相关词时不返回拆书内容", () => {
    const index = buildBookAnalysisContextIndex([{
      bookId: "book-1",
      title: "轻松修仙录",
      modules: [],
      evidence: [snippet("enabled", true)],
    }], 20)

    expect(searchBookAnalysisContextIndex(index, "检查当前章节标点")).toBe("")
  })

  it("不会因为模块摘要共享单个汉字而误命中", () => {
    const index = buildBookAnalysisContextIndex([{
      bookId: "book-1",
      title: "轻松修仙录",
      modules: [{
        skill: "style",
        summary: "作者常用短句推进剧情",
        range: { startOrder: 1, endOrder: 20 },
        updatedAt: 10,
      }],
      evidence: [],
    }], 20)

    expect(searchBookAnalysisContextIndex(index, "分析当前章节的时间线")).toBe("")
    expect(searchBookAnalysisContextIndex(index, "参考这本书的文风写法")).toContain("style 分析")
  })
})
