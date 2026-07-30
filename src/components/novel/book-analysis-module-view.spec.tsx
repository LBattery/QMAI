import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { BookAnalysisLibraryBook } from "@/lib/novel/book-analysis/library-state"
import type { AnalysisModuleState, BookAnalysisPipelineTask } from "@/lib/novel/book-analysis/analysis-pipeline-types"
import { BookAnalysisModuleView } from "./book-analysis-module-view"

function moduleState(skill: AnalysisModuleState["skill"], status: AnalysisModuleState["status"]): AnalysisModuleState {
  return {
    skill,
    status,
    range: { startOrder: 1, endOrder: 20 },
    chunkIds: ["chunk-0001-0010", "chunk-0011-0020"],
    completedChunkIds: [],
    failedChunkId: null,
    resultPath: null,
    analysisVersion: 1,
    updatedAt: 1,
  }
}

const task: BookAnalysisPipelineTask = {
  version: 1,
  id: "task-1",
  batchId: null,
  projectPath: "E:/Novel",
  bookId: "book-1",
  bookPath: "E:/Novel/book-analysis/book-1",
  selectedSkills: ["characters", "style"],
  range: { startOrder: 1, endOrder: 20 },
  status: "running",
  currentSkill: "characters",
  modules: {
    characters: moduleState("characters", "running"),
    story: moduleState("story", "skipped"),
    style: moduleState("style", "pending"),
  },
  error: null,
  createdAt: 1,
  startedAt: 1,
  completedAt: null,
  updatedAt: 1,
}

const book: BookAnalysisLibraryBook = {
  id: "book-1",
  path: task.bookPath,
  metadata: {
    title: "测试作品",
    totalChapters: 20,
    totalWords: 20000,
    sourceType: "file",
    createdAt: 1,
    updatedAt: 1,
  },
  recognizedCharacters: [],
  characters: [],
  skills: [],
  styleStatus: "missing",
  boundAurasCount: 0,
  addedAuraCharacterIds: [],
  evidence: [],
  analysisManifest: {
    version: 1,
    bookId: "book-1",
    modules: { characters: moduleState("characters", "skipped") },
    updatedAt: 0,
  },
}

describe("BookAnalysisModuleView 分析进度", () => {
  it("当前任务状态优先于旧 manifest，并显示区块与下一步", () => {
    const html = renderToStaticMarkup(
      <BookAnalysisModuleView
        book={book}
        task={task}
        chunks={[
          {
            version: 1,
            id: "chunk-0001-0010",
            taskId: task.id,
            skill: "characters",
            chapterIds: ["ch-1"],
            startOrder: 1,
            endOrder: 10,
            wordCount: 1000,
            status: "running",
            attempts: 1,
            resultPath: null,
            error: null,
            startedAt: 1,
            completedAt: null,
            updatedAt: 1,
          },
          {
            version: 1,
            id: "chunk-0011-0020",
            taskId: task.id,
            skill: "characters",
            chapterIds: ["ch-11"],
            startOrder: 11,
            endOrder: 20,
            wordCount: 1000,
            status: "pending",
            attempts: 0,
            resultPath: null,
            error: null,
            startedAt: null,
            completedAt: null,
            updatedAt: 1,
          },
        ]}
        selectedCharacterId={null}
        extractingStyle={false}
        addingToSoul={false}
        onSelectCharacter={vi.fn()}
        onToggleStyle={vi.fn()}
        onAddSelectedSkillsToSoul={vi.fn()}
        onReextract={vi.fn()}
      />,
    )

    expect(html).toContain("正在进行：角色 Skill")
    expect(html).toContain("当前区块：第 1/2 个（第 1～10 章）")
    expect(html).toContain("下一步：文风 Skill")
    expect(html).not.toContain("未选择")
  })
})
