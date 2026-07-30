import { describe, expect, it } from "vitest"
import type { PageSearchResult } from "@/lib/embedding"
import {
  NOVEL_VECTOR_MIN_MATCH_SCORE,
  buildNovelVectorSnippet,
  getNovelVectorMatchScore,
  selectRelevantNovelVectorResults,
} from "./vector-relevance"

function result(overrides: Partial<PageSearchResult> = {}): PageSearchResult {
  return {
    id: "memory-page",
    score: 0.95,
    ...overrides,
  }
}

describe("novel vector relevance", () => {
  it("uses the best raw chunk score instead of the blended page score", () => {
    const candidate = result({
      matchedChunks: [
        { text: "weak match", headingPath: "Memory", score: 0.4 },
      ],
    })

    expect(getNovelVectorMatchScore(candidate)).toBe(0.4)
    expect(selectRelevantNovelVectorResults([candidate], 5)).toEqual([])
  })

  it("keeps strong matches in their existing order and respects topK", () => {
    const first = result({
      id: "first",
      matchedChunks: [{ text: "first", headingPath: "A", score: 0.8 }],
    })
    const second = result({
      id: "second",
      matchedChunks: [{ text: "second", headingPath: "B", score: 0.7 }],
    })

    expect(NOVEL_VECTOR_MIN_MATCH_SCORE).toBe(0.45)
    expect(selectRelevantNovelVectorResults([first, second], 1)).toEqual([first])
  })

  it("falls back to the page score for legacy results without matched chunks", () => {
    const strongLegacy = result({ id: "strong", score: 0.8 })
    const weakLegacy = result({ id: "weak", score: 0.4 })

    expect(getNovelVectorMatchScore(strongLegacy)).toBe(0.8)
    expect(selectRelevantNovelVectorResults([strongLegacy, weakLegacy], 5)).toEqual([strongLegacy])
  })

  it("builds a bounded snippet from qualifying matched chunks", () => {
    const candidate = result({
      matchedChunks: [
        { text: "  Lin   discovers the seal.  ", headingPath: "Chapter 12 / Seal", score: 0.82 },
        { text: "The seal belongs to the northern faction.", headingPath: "Faction", score: 0.68 },
        { text: "unrelated tail", headingPath: "Tail", score: 0.3 },
      ],
    })

    const snippet = buildNovelVectorSnippet(candidate)

    expect(snippet).toContain("Chapter 12 / Seal: Lin discovers the seal.")
    expect(snippet).toContain("Faction: The seal belongs to the northern faction.")
    expect(snippet).not.toContain("unrelated tail")
    expect(snippet.length).toBeLessThanOrEqual(800)
  })
})
