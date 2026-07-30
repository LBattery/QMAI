import { describe, expect, it, vi } from "vitest"
import type { LlmConfig } from "@/stores/wiki-store"
import type { AnalysisSkill, BookAnalysisPipelineTask } from "./analysis-pipeline-types"
import { createStyleAnalysisAdapter } from "./style-analysis-adapter"

function task(): BookAnalysisPipelineTask {
  const module = (skill: AnalysisSkill) => ({
    skill,
    status: "pending" as const,
    range: { startOrder: 1, endOrder: 10 },
    chunkIds: ["chunk-0001-0010"],
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
    selectedSkills: ["style"],
    range: { startOrder: 1, endOrder: 10 },
    status: "running",
    currentSkill: "style",
    modules: { characters: module("characters"), story: module("story"), style: module("style") },
    error: null,
    createdAt: 1,
    startedAt: 1,
    completedAt: null,
    updatedAt: 1,
  }
}

describe("style analysis adapter", () => {
  it("文风结果包含幽默、热血、视角、词汇和证据", async () => {
    const adapter = createStyleAnalysisAdapter({
      readFile: vi.fn(async () => "---\nid: ch-0001\n---\n这是代表性正文。"),
      loadMetadata: vi.fn(async () => ({
        title: "测试作品",
        totalChapters: 1,
        totalWords: 100,
        sourceType: "file" as const,
        createdAt: 1,
        updatedAt: 1,
      })),
      callModel: vi.fn(async () => JSON.stringify({
        narrativeDensity: "推进快",
        constitution: "1. 使用短句加速",
        humorMechanisms: ["一本正经地补刀"],
        highEnergyMechanisms: ["目标兑现前连续抬压"],
        pointOfView: "第三人称限知",
        vocabularyPreferences: ["口语化动词"],
        avoidPatterns: ["解释笑点"],
        samples: ["这是代表性正文。"],
        evidence: [{
          chapterId: "ch-0001",
          text: "这是代表性正文。",
          tags: ["幽默对白"],
          reason: "反差",
          purpose: "对白节奏",
        }],
      })),
      now: () => 10,
    })
    const inputTask = task()
    const output = await adapter.runChunk({
      task: inputTask,
      skill: "style",
      bookPath: inputTask.bookPath,
      projectPath: inputTask.projectPath,
      llmConfig: {} as LlmConfig,
      chunk: {
        version: 1,
        id: "chunk-0001-0001",
        taskId: inputTask.id,
        skill: "style",
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

    expect(output.result.profile.humorMechanisms).toEqual(["一本正经地补刀"])
    expect(output.result.profile.highEnergyMechanisms).toEqual(["目标兑现前连续抬压"])
    expect(output.result.profile.pointOfView).toBe("第三人称限知")
    expect(output.result.profile.vocabularyPreferences).toEqual(["口语化动词"])
    expect(output.evidence[0].tags).toContain("幽默对白")
  })
})
