export type ChapterSaveDialogOption = "append" | "replace" | "save_to_next"

export type ChapterSaveStrategy =
  | {
    action: "direct_current_empty"
    targetChapterNumber: number
  }
  | {
    action: "dialog_selected_exists"
    targetChapterNumber: number
    options: ChapterSaveDialogOption[]
  }
  | {
    action: "direct_explicit_target_new"
    targetChapterNumber: number
  }
  | {
    action: "dialog_explicit_target_exists"
    targetChapterNumber: number
    options: Array<Exclude<ChapterSaveDialogOption, "save_to_next">>
  }

export function decideChapterSaveStrategy(input: {
  selectedChapterNumber: number | null
  selectedChapterHasBody: boolean
  generatedTargetChapterNumber: number | null
  generatedTargetExists: boolean
}): ChapterSaveStrategy {
  if (
    input.generatedTargetChapterNumber &&
    input.generatedTargetChapterNumber > 0 &&
    input.generatedTargetChapterNumber !== input.selectedChapterNumber
  ) {
    if (input.generatedTargetExists) {
      return {
        action: "dialog_explicit_target_exists",
        targetChapterNumber: input.generatedTargetChapterNumber,
        options: ["append", "replace"],
      }
    }
    return {
      action: "direct_explicit_target_new",
      targetChapterNumber: input.generatedTargetChapterNumber,
    }
  }

  return {
    action: input.selectedChapterHasBody ? "dialog_selected_exists" : "direct_current_empty",
    targetChapterNumber: input.selectedChapterNumber ?? 1,
    ...(input.selectedChapterHasBody
      ? { options: ["append", "replace", "save_to_next"] as ChapterSaveDialogOption[] }
      : {}),
  } as ChapterSaveStrategy
}

export function detectGeneratedTargetChapterNumber(content: string): number | null {
  const match = content.match(/第\s*(\d+)\s*章/)
  if (match?.[1]) return Number.parseInt(match[1], 10)
  return null
}
