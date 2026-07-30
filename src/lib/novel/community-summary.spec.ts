import { beforeEach, describe, expect, it, vi } from "vitest"
import { searchByEmbedding } from "@/lib/embedding"
import { useWikiStore } from "@/stores/wiki-store"
import { searchCommunitySummaries } from "./community-summary"

vi.mock("@/commands/fs", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  createDirectory: vi.fn(),
}))
vi.mock("@/lib/wiki-graph", () => ({ buildWikiGraph: vi.fn() }))
vi.mock("@/lib/llm-client", () => ({
  streamChat: vi.fn(),
  DEFAULT_LLM_REQUEST_TIMEOUT_MS: 45000,
}))
vi.mock("@/lib/novel/model-resolver", () => ({ resolveNovelModel: vi.fn() }))
vi.mock("@/lib/embedding", () => ({
  embedPage: vi.fn(),
  searchByEmbedding: vi.fn(),
}))

const mockSearchByEmbedding = vi.mocked(searchByEmbedding)

describe("community summary vector noise control", () => {
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

  it("returns only community summaries with a strong raw chunk match", async () => {
    mockSearchByEmbedding.mockResolvedValue([
      {
        id: "community:1",
        score: 0.99,
        matchedChunks: [{ text: "Weak neighboring faction", headingPath: "Weak", score: 0.4 }],
      },
      {
        id: "community:2",
        score: 0.88,
        matchedChunks: [{
          text: "The northern faction controls the seal and opposes Lin.",
          headingPath: "Northern faction",
          score: 0.8,
        }],
      },
    ])

    const output = await searchCommunitySummaries("/project", "who controls the seal", 3)

    expect(output).toContain("社区2")
    expect(output).toContain("Northern faction")
    expect(output).not.toContain("社区1")
    expect(output).not.toContain("Weak neighboring faction")
  })

  it("returns empty context when every community match is weak", async () => {
    mockSearchByEmbedding.mockResolvedValue([{
      id: "community:1",
      score: 0.95,
      matchedChunks: [{ text: "Weak neighboring faction", headingPath: "Weak", score: 0.4 }],
    }])

    await expect(searchCommunitySummaries("/project", "unrelated chapter task", 3)).resolves.toBe("")
  })
})
