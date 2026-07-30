import { beforeEach, describe, expect, it, vi } from "vitest"
import { searchWiki } from "@/lib/search"
import { searchByEmbedding } from "@/lib/embedding"
import { useWikiStore } from "@/stores/wiki-store"
import { novelMixedSearch } from "./search-adapter"
import { searchRelevantContentUnified } from "./context-engine"

vi.mock("@/commands/fs", () => ({
  readFile: vi.fn(),
  listDirectory: vi.fn(async () => []),
}))
vi.mock("@/lib/search", () => ({
  tokenizeQuery: (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean),
  searchWiki: vi.fn(),
}))
vi.mock("@/lib/embedding", () => ({ searchByEmbedding: vi.fn() }))
vi.mock("@/lib/rerank", () => ({
  rerankCandidates: vi.fn(async (_query, candidates, options) =>
    candidates.slice(0, options?.topK ?? candidates.length)),
}))
vi.mock("./search-adapter", () => ({
  novelMixedSearch: vi.fn(),
  isHistoricalProjectionSnippet: vi.fn(() => false),
  isAuthoritativeGenerationPath: vi.fn((path: string) => path.includes("/wiki/memory/")),
}))

const mockSearchWiki = vi.mocked(searchWiki)
const mockSearchByEmbedding = vi.mocked(searchByEmbedding)
const mockNovelMixedSearch = vi.mocked(novelMixedSearch)

describe("searchRelevantContentUnified retrieval noise control", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWikiStore.setState({
      embeddingConfig: {
        enabled: true,
        endpoint: "http://localhost:11434/api/embeddings",
        apiKey: "",
        model: "nomic-embed-text",
      },
    })
  })

  it("uses one vector branch and emits one result per normalized path", async () => {
    mockNovelMixedSearch.mockResolvedValue([{
      type: "vector",
      path: "/project/wiki/memory/shared.md",
      title: "Shared Memory",
      snippet: "Matched semantic chunk",
      relevance: 0.9,
    }])
    mockSearchWiki.mockResolvedValue([{
      path: "/project/wiki/memory/shared.md",
      title: "Shared Memory",
      snippet: "Different index excerpt",
      titleMatch: false,
      score: 0.5,
      images: [],
    }])
    mockSearchByEmbedding.mockResolvedValue([])

    const output = await searchRelevantContentUnified(
      "/project",
      "continue the northern faction plot",
      12,
      5,
    )

    expect(output.match(/- Shared Memory:/g)).toHaveLength(1)
    expect(mockSearchWiki).toHaveBeenCalledWith(
      "/project",
      expect.stringContaining("continue the northern faction plot"),
      expect.objectContaining({
        includeVector: false,
        rerank: true,
        topK: 5,
      }),
    )
    expect(mockSearchByEmbedding).not.toHaveBeenCalled()
  })
})
