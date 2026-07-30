import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  computeContextBudget,
  computeNovelContextTokenBudget,
  computeWritingContextPackTokenBudget,
  resolveContextPackTokenBudget,
  WRITING_OUTPUT_RESERVE_MULTIPLIER,
} from "./context-budget"

describe("context pack budget contracts", () => {
  it("auto mode is always finite and bounded by the window-derived cap", () => {
    for (const maxContextSize of [64_000, 204_800, 1_000_000]) {
      const general = resolveContextPackTokenBudget({
        maxContextSize,
        contextTokenBudget: 0,
        langScale: 1,
      })
      const writing = computeWritingContextPackTokenBudget({
        maxContextSize,
        contextTokenBudget: 0,
        chapterTargetChars: 3_000,
        langScale: 1,
      })
      expect(Number.isFinite(general)).toBe(true)
      expect(Number.isFinite(writing)).toBe(true)
      expect(general).toBeGreaterThan(0)
      expect(writing).toBeGreaterThan(0)
      expect(general).toBeLessThanOrEqual(computeNovelContextTokenBudget(maxContextSize, 0, 1))
      expect(writing).toBeLessThanOrEqual(general)
    }
  })

  it("writing budget collapses to zero when the window cannot fit output reserve", () => {
    const writing = computeWritingContextPackTokenBudget({
      maxContextSize: 32_000,
      chapterTargetChars: 3_000,
      langScale: 1,
    })
    expect(writing).toBe(0)
  })

  it("writing pack leaves room for output-token reserve plus scaffold", () => {
    for (const chapterTargetChars of [2_000, 3_000, 6_000]) {
      for (const maxContextSize of [64_000, 204_800]) {
        const { maxCtx } = computeContextBudget(maxContextSize, 1)
        const packTokens = computeWritingContextPackTokenBudget({
          maxContextSize,
          chapterTargetChars,
          langScale: 1,
        })
        const maxOutputTokens = chapterTargetChars === 3_000
          ? 8_000
          : Math.max(8_000, Math.ceil((chapterTargetChars + 500) * 2))
        const targetReserveTokens = Math.ceil(
          (chapterTargetChars * WRITING_OUTPUT_RESERVE_MULTIPLIER) / 1.7,
        )
        const outputReserveChars = Math.max(targetReserveTokens, maxOutputTokens) * 4
        const scaffold = Math.max(8_000, Math.floor(maxCtx * 0.08))
        expect(packTokens * 4 + outputReserveChars + scaffold).toBeLessThanOrEqual(maxCtx)
      }
    }
  })

  it("chat-panel fallback resolves budget instead of passing undefined", () => {
    const source = readFileSync(resolve(__dirname, "../components/chat/chat-panel.tsx"), "utf8")
    expect(source).toContain("resolveContextPackTokenBudget({")
    expect(source).not.toContain("contextTokenBudget > 0 ? novelConfig.contextTokenBudget : undefined")
  })

  it("context-engine never uses Infinity for pack trimming", () => {
    const source = readFileSync(resolve(__dirname, "./novel/context-engine.ts"), "utf8")
    expect(source).not.toMatch(/tokenBudget \? tokenBudget \* 4 : Infinity/)
    expect(source).toContain("resolveContextPackTokenBudget({ maxContextSize: options?.maxContextSize })")
  })

  it("deep chapter no longer hard-codes a 32000 context budget", () => {
    const source = readFileSync(resolve(__dirname, "./novel/deep-chapter-generation.ts"), "utf8")
    expect(source).toContain("computeWritingContextPackTokenBudget({")
    expect(source).not.toContain("DEEP_CHAPTER_CONTEXT_TOKEN_BUDGET")
  })
})
