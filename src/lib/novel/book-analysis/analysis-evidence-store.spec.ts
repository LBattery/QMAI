import { describe, expect, it } from "vitest"
import type { AnalysisEvidenceSnippet } from "./analysis-pipeline-types"
import {
  loadEvidence,
  mergeEvidence,
  replaceAutomaticEvidence,
  setEvidenceEnabled,
  type AnalysisEvidenceStoreIo,
} from "./analysis-evidence-store"

function evidence(id: string, overrides: Partial<AnalysisEvidenceSnippet> = {}): AnalysisEvidenceSnippet {
  return {
    version: 1,
    id,
    bookId: "book-1",
    skill: "style",
    taskId: "analysis-1",
    chapterId: "ch-0008",
    chapterOrder: 8,
    text: "一本正经地补了一句，屋里反而更安静了。",
    tags: ["幽默对白"],
    reason: "严肃语气与结果形成反差",
    purpose: "学习幽默对白节奏",
    enabled: true,
    userPinned: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function createMemoryIo() {
  const files = new Map<string, string>()
  const directories = new Set<string>()
  const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "")
  const io: AnalysisEvidenceStoreIo = {
    async createDirectory(path) { directories.add(normalize(path)) },
    async fileExists(path) { return files.has(normalize(path)) || directories.has(normalize(path)) },
    async readFile(path) {
      const value = files.get(normalize(path))
      if (value === undefined) throw new Error("文件不存在")
      return value
    },
    async writeFileAtomic(path, contents) { files.set(normalize(path), contents) },
  }
  return { io, files }
}

describe("analysis evidence store", () => {
  it("相同 Skill、章节和标准化文本只保留一条", async () => {
    const memory = createMemoryIo()
    const bookPath = "E:/Novel/book-analysis/book-1"

    await mergeEvidence(bookPath, [
      evidence("e1"),
      evidence("e2", { text: "  一本正经地补了一句，屋里反而更安静了。  " }),
    ], memory.io)

    expect((await loadEvidence(bookPath, memory.io)).snippets).toHaveLength(1)
  })

  it("重提当前 Skill 时保留其他 Skill 和用户固定片段", async () => {
    const memory = createMemoryIo()
    const bookPath = "E:/Novel/book-analysis/book-1"
    await mergeEvidence(bookPath, [
      evidence("old-style"),
      evidence("pinned-style", { chapterId: "ch-0009", text: "用户固定片段", userPinned: true }),
      evidence("character", { skill: "characters", chapterId: "ch-0001", text: "角色高光" }),
    ], memory.io)

    await replaceAutomaticEvidence(bookPath, "style", [
      evidence("new-style", { chapterId: "ch-0010", text: "新文风片段" }),
    ], memory.io)

    const ids = (await loadEvidence(bookPath, memory.io)).snippets.map((item) => item.id)
    expect(ids).toEqual(["pinned-style", "character", "new-style"])
  })

  it("可以禁用单个片段", async () => {
    const memory = createMemoryIo()
    const bookPath = "E:/Novel/book-analysis/book-1"
    await mergeEvidence(bookPath, [evidence("e1")], memory.io)

    await setEvidenceEnabled(bookPath, "e1", false, memory.io)

    expect((await loadEvidence(bookPath, memory.io)).snippets[0].enabled).toBe(false)
  })
})
