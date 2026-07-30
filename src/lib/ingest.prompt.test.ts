import { describe, it, expect } from "vitest"
import {
  computeIngestAnalysisMaxTokens,
  computeIngestGenerationMaxTokens,
  computeIngestReviewMaxTokens,
  computeIngestSourceBudget,
  fitIngestOutputToWindow,
  splitSourceIntoSemanticChunks,
} from "./ingest"

// langScale=1 pins these ladder-math tests to the English window so they
// stay deterministic regardless of the active UI language (default zh).
describe("long-source ingest planning", () => {
  it("scales generation output tokens with the configured context window", () => {
    expect(computeIngestGenerationMaxTokens(64_000, 1)).toBe(8_192)
    expect(computeIngestGenerationMaxTokens(128_000, 1)).toBe(16_384)
    expect(computeIngestGenerationMaxTokens(256_000, 1)).toBe(24_576)
    expect(computeIngestGenerationMaxTokens(1_000_000, 1)).toBe(32_768)
    expect(computeIngestReviewMaxTokens(1_000_000, 1)).toBe(8_192)
  })

  it("drops to a lower output tier under CJK scaling for the same window", () => {
    // 128000 chars * 0.425 ≈ 54400 → below the 128K tier → default 8192.
    expect(computeIngestGenerationMaxTokens(128_000, 0.425)).toBe(8_192)
  })

  it("scales analysis output tokens with the window but caps at 8192 (floor 4096)", () => {
    // Small window keeps the legacy 4096 floor.
    expect(computeIngestAnalysisMaxTokens(64_000, 1)).toBe(4_096)
    // Larger windows scale up but never exceed the 8192 cap.
    expect(computeIngestAnalysisMaxTokens(128_000, 1)).toBe(8_192)
    expect(computeIngestAnalysisMaxTokens(1_000_000, 1)).toBe(8_192)
  })

  it("scales source budget from the configured context window instead of a fixed 50k cap", () => {
    const small = computeIngestSourceBudget(64_000, 8_000, 1)
    const large = computeIngestSourceBudget(1_000_000, 8_000, 1)

    expect(small).toBeGreaterThan(20_000)
    expect(large).toBeGreaterThan(200_000)
    expect(large).toBeLessThanOrEqual(300_000)
  })

  it("shrinks the source budget under CJK scaling", () => {
    const en = computeIngestSourceBudget(1_000_000, 8_000, 1)
    const zh = computeIngestSourceBudget(1_000_000, 8_000, 0.425)
    expect(zh).toBeLessThan(en)
  })

  it("keeps the desired output tokens when the window has ample room", () => {
    expect(fitIngestOutputToWindow(1_000_000, 10_000, 8_192, 1)).toBe(8_192)
  })

  it("shrinks output tokens so prompt + output fits the window", () => {
    // 64000-char window → 16000 tokens; 60000-char prompt → 15000 tokens in;
    // only 1000 tokens left for output.
    expect(fitIngestOutputToWindow(64_000, 60_000, 8_192, 1)).toBe(1_000)
  })

  it("falls back to the output floor when the prompt already overflows", () => {
    expect(fitIngestOutputToWindow(64_000, 300_000, 8_192, 1)).toBe(512)
  })

  it("leaves less output room for CJK prompts than English ones", () => {
    const en = fitIngestOutputToWindow(64_000, 40_000, 8_192, 1)
    const zh = fitIngestOutputToWindow(64_000, 40_000, 8_192, 0.425)
    expect(zh).toBeLessThan(en)
  })

  it("splits long sources on heading and paragraph boundaries with overlap", () => {
    const content = [
      "# Chapter One",
      "",
      "A".repeat(1200),
      "",
      "B".repeat(1200),
      "",
      "## Section Two",
      "",
      "C".repeat(1200),
      "",
      "D".repeat(1200),
    ].join("\n")

    const chunks = splitSourceIntoSemanticChunks(content, 1800, 200)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].headingPath).toBe("Chapter One")
    expect(chunks.some((chunk) => chunk.headingPath.includes("Section Two"))).toBe(true)
    expect(chunks[1].overlapBefore.length).toBeGreaterThan(0)
    expect(chunks[1].main.startsWith(chunks[0].main.slice(-200))).toBe(false)
  })
})
