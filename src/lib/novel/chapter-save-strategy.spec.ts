import { describe, expect, it } from "vitest"
import { decideChapterSaveStrategy, detectGeneratedTargetChapterNumber } from "./chapter-save-strategy"

describe("decideChapterSaveStrategy", () => {
  it("directly saves into the selected chapter when the selected chapter body is empty", () => {
    const result = decideChapterSaveStrategy({
      selectedChapterNumber: 1,
      selectedChapterHasBody: false,
      generatedTargetChapterNumber: null,
      generatedTargetExists: false,
    })

    expect(result).toEqual({
      action: "direct_current_empty",
      targetChapterNumber: 1,
    })
  })

  it("shows three actions when the selected chapter already has content", () => {
    const result = decideChapterSaveStrategy({
      selectedChapterNumber: 1,
      selectedChapterHasBody: true,
      generatedTargetChapterNumber: null,
      generatedTargetExists: false,
    })

    expect(result).toEqual({
      action: "dialog_selected_exists",
      targetChapterNumber: 1,
      options: ["append", "replace", "save_to_next"],
    })
  })

  it("directly creates the explicit target chapter when it does not yet exist", () => {
    const result = decideChapterSaveStrategy({
      selectedChapterNumber: 1,
      selectedChapterHasBody: true,
      generatedTargetChapterNumber: 7,
      generatedTargetExists: false,
    })

    expect(result).toEqual({
      action: "direct_explicit_target_new",
      targetChapterNumber: 7,
    })
  })

  it("shows two actions when the explicit target chapter already exists", () => {
    const result = decideChapterSaveStrategy({
      selectedChapterNumber: 1,
      selectedChapterHasBody: true,
      generatedTargetChapterNumber: 7,
      generatedTargetExists: true,
    })

    expect(result).toEqual({
      action: "dialog_explicit_target_exists",
      targetChapterNumber: 7,
      options: ["append", "replace"],
    })
  })

  it("prefers the explicit generated target chapter over the currently selected chapter", () => {
    const result = decideChapterSaveStrategy({
      selectedChapterNumber: 1,
      selectedChapterHasBody: false,
      generatedTargetChapterNumber: 7,
      generatedTargetExists: true,
    })

    expect(result).toEqual({
      action: "dialog_explicit_target_exists",
      targetChapterNumber: 7,
      options: ["append", "replace"],
    })
  })
})

describe("detectGeneratedTargetChapterNumber", () => {
  it("detects an explicit generated chapter number from the content", () => {
    expect(detectGeneratedTargetChapterNumber("# 第7章 夜雨旧屋\n\n正文内容")).toBe(7)
    expect(detectGeneratedTargetChapterNumber("普通正文，没有章节号")).toBeNull()
  })
})
