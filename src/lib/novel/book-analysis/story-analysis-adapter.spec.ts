import { describe, expect, it, vi } from "vitest"
import type { LlmConfig } from "@/stores/wiki-store"
import type { AnalysisSkill, BookAnalysisPipelineTask } from "./analysis-pipeline-types"
import { createStoryAnalysisAdapter } from "./story-analysis-adapter"

function task(): BookAnalysisPipelineTask {
  const module = (skill: AnalysisSkill) => ({
    skill,
    status: "pending" as const,
    range: { startOrder: 1, endOrder: 20 },
    chunkIds: ["chunk-0001-0010", "chunk-0011-0020"],
    completedChunkIds: [],
    failedChunkId: null,
    resultPath: null,
    analysisVersion: 1,
    updatedAt: 1,
  })
  return {
    version: 1,
    id: "task-1",
    batchId: null,
    projectPath: "E:/Novel",
    bookId: "book-1",
    bookPath: "E:/Novel/book-analysis/book-1",
    selectedSkills: ["story"],
    range: { startOrder: 1, endOrder: 20 },
    status: "running",
    currentSkill: "story",
    modules: { characters: module("characters"), story: module("story"), style: module("style") },
    error: null,
    createdAt: 1,
    startedAt: 1,
    completedAt: null,
    updatedAt: 1,
  }
}

const metadata = {
  title: "测试作品",
  totalChapters: 20,
  totalWords: 20000,
  sourceType: "file" as const,
  createdAt: 1,
  updatedAt: 1,
}

describe("story analysis adapter", () => {
  it("只选故事时临时识别人物但不会发布角色结果", async () => {
    const recognizeCharacters = vi.fn(async () => [{
      id: "character-1",
      name: "林远",
      aliases: ["小远"],
      appearances: 1,
      chapterIndices: [0],
      importanceScore: 90,
      category: "主角" as const,
      sourceBook: "测试作品",
    }])
    const callModel = vi.fn(async (messages) => messages[1].content)
    const adapter = createStoryAnalysisAdapter({
      recognizeCharacters,
      callModel,
      loadMetadata: vi.fn(async () => metadata),
      loadChapters: vi.fn(async () => [{ id: "ch-0001", title: "第一章", order: 1, content: "林远推门而入。" }]),
      now: () => 10,
    })
    const inputTask = task()
    const output = await adapter.runChunk({
      task: inputTask,
      skill: "story",
      bookPath: inputTask.bookPath,
      projectPath: inputTask.projectPath,
      llmConfig: {} as LlmConfig,
      chunk: {
        version: 1,
        id: "chunk-0001-0001",
        taskId: inputTask.id,
        skill: "story",
        chapterIds: ["ch-0001"],
        startOrder: 1,
        endOrder: 1,
        wordCount: 100,
        status: "running",
        attempts: 1,
        resultPath: null,
        error: null,
        startedAt: 1,
        completedAt: null,
        updatedAt: 1,
      },
      signal: new AbortController().signal,
    })

    expect(recognizeCharacters).toHaveBeenCalledTimes(1)
    expect(callModel.mock.calls[0][0][1].content).toContain("临时人物线索")
    expect(callModel.mock.calls[0][0][1].content).toContain("禁止输出角色 Skill")
    expect(output.evidence[0].skill).toBe("story")
  })

  it("故事汇总只保留已完成区块的用户章节范围", async () => {
    const callModel = vi.fn(async () => "汇总结果")
    const adapter = createStoryAnalysisAdapter({ callModel })
    const inputTask = task()
    const result = await adapter.aggregate({
      task: inputTask,
      skill: "story",
      bookPath: inputTask.bookPath,
      projectPath: inputTask.projectPath,
      llmConfig: {} as LlmConfig,
      chunks: [
        { markdown: "区块一", rangeChapterIds: ["ch-0001", "ch-0002"] },
        { markdown: "区块二", rangeChapterIds: ["ch-0011", "ch-0012"] },
      ],
      signal: new AbortController().signal,
    })

    expect(result.rangeChapterIds).toEqual(["ch-0001", "ch-0002", "ch-0011", "ch-0012"])
    expect(callModel).toHaveBeenCalledTimes(1)
  })
})
