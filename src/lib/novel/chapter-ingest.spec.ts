import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { buildSnapshotMemorySyncPreview, normalizeChapterSnapshot } from "./chapter-ingest"
import { buildChapterIngestOutput } from "./chapter-ingest-output"
import { buildStructuredMemoryDocuments } from "./memory-rebuild"

const source = readFileSync(resolve(__dirname, "chapter-ingest.ts"), "utf8")

describe("chapter ingest draft boundary", () => {
  it("keeps draft ingestion opt-in so existing final-only flows do not change", () => {
    expect(source).toContain("interface IngestChapterOptions")
    expect(source).toContain("allowDraft?: boolean")
    expect(source).toContain("options: IngestChapterOptions = {}")
    expect(source).toContain("if (!options.allowDraft && !isFinalChapter(fm))")
    expect(source).toContain('failReason: "not_final"')
  })
})

describe("chapter snapshot appearance compatibility", () => {
  it("preserves clothing data from legacy snapshots", () => {
    const snapshot = normalizeChapterSnapshot({
      chapterId: "chapter-12",
      chapterNumber: 12,
      characterAppearanceAndStatus: ["林夏：白色针织衫、深色长裤；左臂受伤"],
      femaleCharacterSexualEvents: ["legacy-data"],
    })

    expect(snapshot?.characterAppearanceAndStatus).toEqual([
      "林夏：白色针织衫、深色长裤；左臂受伤",
    ])
    expect(snapshot?.femaleCharacterSexualEvents).toEqual(["legacy-data"])
  })

  it("normalizes snapshots created before the clothing field existed", () => {
    const snapshot = normalizeChapterSnapshot({ chapterId: "chapter-1", chapterNumber: 1 })

    expect(snapshot?.characterAppearanceAndStatus).toEqual([])
  })

  it("keeps clothing extraction and memory-sync preview in the ingest contract", () => {
    expect(source).toContain('"characterAppearanceAndStatus": ["角色名：本章可见的外貌与衣着，当前状态"]')
    expect(source).toContain("未描写衣着时不要推测")

    const snapshot = normalizeChapterSnapshot({
      chapterId: "chapter-2",
      chapterNumber: 2,
      characters: ["周宁"],
      characterAppearanceAndStatus: ["周宁：黑色风衣；正在追踪目标"],
    })
    expect(snapshot).not.toBeNull()
    expect(buildSnapshotMemorySyncPreview(snapshot!)).toContain("周宁：黑色风衣；正在追踪目标")

    const output = buildChapterIngestOutput(snapshot!)
    expect(output.searchIndexText.sections).toContainEqual(expect.objectContaining({
      name: "角色外貌、衣着和当前状态",
      content: "周宁：黑色风衣；正在追踪目标",
    }))
    expect(output.vectorIndexText.chunks).toContainEqual(expect.objectContaining({
      kind: "appearance",
      text: "周宁：黑色风衣；正在追踪目标",
    }))
    expect(output.wikiUpdatePatch.entries.find((entry) => entry.entryId === "character:周宁")?.fields)
      .toEqual(expect.objectContaining({ appearanceAndStatus: "黑色风衣；正在追踪目标" }))

    const documents = buildStructuredMemoryDocuments([snapshot!])
    expect(documents["chapter-snapshots.md"]).toContain("周宁：黑色风衣；正在追踪目标")
  })
})
