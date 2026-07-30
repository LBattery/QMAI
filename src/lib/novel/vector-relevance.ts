import type { PageSearchResult } from "@/lib/embedding"

export const NOVEL_VECTOR_MIN_MATCH_SCORE = 0.45

export function getNovelVectorMatchScore(result: PageSearchResult): number {
  const chunkScores = result.matchedChunks?.map((chunk) => chunk.score) ?? []
  return chunkScores.length > 0 ? Math.max(...chunkScores) : result.score
}

export function selectRelevantNovelVectorResults(
  results: PageSearchResult[],
  topK: number,
): PageSearchResult[] {
  if (topK <= 0) return []
  return results
    .filter((result) => getNovelVectorMatchScore(result) >= NOVEL_VECTOR_MIN_MATCH_SCORE)
    .slice(0, topK)
}

export function buildNovelVectorSnippet(
  result: PageSearchResult,
  maxChars: number = 800,
): string {
  if (maxChars <= 0) return ""

  const snippet = (result.matchedChunks ?? [])
    .filter((chunk) => chunk.score >= NOVEL_VECTOR_MIN_MATCH_SCORE)
    .slice(0, 2)
    .map((chunk) => {
      const text = chunk.text.replace(/\s+/g, " ").trim()
      const heading = chunk.headingPath.replace(/\s+/g, " ").trim()
      return heading ? `${heading}: ${text}` : text
    })
    .filter(Boolean)
    .join("\n")

  return snippet.slice(0, maxChars)
}
