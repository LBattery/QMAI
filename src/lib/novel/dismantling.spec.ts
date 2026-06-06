import { describe, expect, it } from "vitest"
import {
  buildDismantlingAnalysisPrompt,
  buildDismantlingReferenceDirective,
  getDismantlingLibraryPath,
  selectNextDismantlingBatch,
  splitDismantlingTextIntoChapters,
  type DismantlingProject,
} from "./dismantling"

describe("dismantling library", () => {
  it("stores dismantling data in an isolated project cache path", () => {
    expect(getDismantlingLibraryPath("E:/Novel")).toBe("E:/Novel/.qmai/dismantling/library.json")
  })

  it("splits imported text into ordered chapters without writing to novel memory", () => {
    const chapters = splitDismantlingTextIntoChapters(`第一章 开局
主角遭遇危机。

第二章 反击
主角开始行动。`)

    expect(chapters).toHaveLength(2)
    expect(chapters[0]).toMatchObject({ chapterNumber: 1, title: "第一章 开局" })
    expect(chapters[1]).toMatchObject({ chapterNumber: 2, title: "第二章 反击" })
    expect(chapters.map((item) => item.content).join("\n")).not.toContain("wiki/chapters")
  })

  it("selects only the requested pending chapters for one batch", () => {
    const project: DismantlingProject = {
      id: "book-1",
      title: "示例作品",
      createdAt: 1,
      updatedAt: 1,
      chapters: [
        { id: "c1", chapterNumber: 1, title: "第一章", content: "一", status: "pending" },
        { id: "c2", chapterNumber: 2, title: "第二章", content: "二", status: "done" },
        { id: "c3", chapterNumber: 3, title: "第三章", content: "三", status: "pending" },
      ],
      analyses: [],
      structureMemory: [],
    }

    expect(selectNextDismantlingBatch(project, { selectedChapterIds: ["c1", "c3"], batchSize: 1 }).map((item) => item.id)).toEqual(["c1"])
    expect(selectNextDismantlingBatch(project, { selectedChapterIds: ["c1", "c3"], batchSize: 5 }).map((item) => item.id)).toEqual(["c1", "c3"])
  })

  it("builds an analysis prompt that keeps dismantling memory separate from current novel facts", () => {
    const prompt = buildDismantlingAnalysisPrompt({
      projectTitle: "参考作品",
      chapters: [
        { id: "c1", chapterNumber: 1, title: "第一章", content: "主角被追杀，反手设局。", status: "pending" },
      ],
    })

    expect(prompt).toContain("独立拆文记忆库")
    expect(prompt).toContain("不得把原作人物、设定、剧情当成当前小说事实")
    expect(prompt).toContain("只输出结构化写法分析")
    expect(prompt).toContain("章节结构")
    expect(prompt).toContain("爽点")
    expect(prompt).toContain("结尾钩子")
  })

  it("builds a chat directive that references structure but forbids copying original content", () => {
    const directive = buildDismantlingReferenceDirective({
      title: "参考作品",
      structureMemory: [
        "前三章节奏：开局危机、第二章反击、第三章扩大代价。",
        "结尾钩子：每章末尾留下立即行动压力。",
      ],
    })

    expect(directive).toContain("参考拆文结构")
    expect(directive).toContain("不得复用原作人物")
    expect(directive).toContain("不得复用原作剧情")
    expect(directive).toContain("只学习节奏、冲突推进、爽点安排和章节钩子")
  })
})
