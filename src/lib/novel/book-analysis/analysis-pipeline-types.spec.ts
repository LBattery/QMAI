import { describe, expect, it } from "vitest"
import {
  ANALYSIS_SKILL_ORDER,
  normalizeSelectedSkills,
  type AnalysisEvidenceSnippet,
} from "./analysis-pipeline-types"

describe("analysis pipeline types", () => {
  it("只保留用户选择的 Skill 并按固定依赖顺序排列", () => {
    expect(normalizeSelectedSkills(["style", "characters", "style"])).toEqual([
      "characters",
      "style",
    ])
    expect(ANALYSIS_SKILL_ORDER).toEqual(["characters", "story", "style"])
  })

  it("证据片段携带来源章节、保存原因和分析用途", () => {
    const evidence: AnalysisEvidenceSnippet = {
      version: 1,
      id: "evidence-1",
      bookId: "book-1",
      skill: "style",
      taskId: "analysis-1",
      chapterId: "ch-0008",
      chapterOrder: 8,
      text: "他停了一下，认真补充了一句。",
      tags: ["幽默对白"],
      reason: "通过一本正经的补充制造反差",
      purpose: "学习幽默对白节奏",
      enabled: true,
      userPinned: false,
      createdAt: 1,
      updatedAt: 1,
    }

    expect(evidence.chapterOrder).toBe(8)
    expect(evidence.reason).toContain("反差")
    expect(evidence.purpose).toContain("对白")
  })
})
