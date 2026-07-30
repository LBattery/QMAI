import { describe, expect, it, vi } from "vitest"
import type { ContextHubResult, ContextHubSnapshotRef, ContextHubStats } from "./types"
import { applyProviderUsageToStats, persistContextHubProviderUsage } from "./provider-usage"
import type { UserMemoryDecision } from "@/lib/user-memory/decision-trace"

const baseStats: ContextHubStats = {
  hits: 2,
  refreshed: 1,
  failures: 0,
  stableTokens: 1000,
  summaryTokens: 100,
  dynamicTokens: 300,
  candidateTokens: 2000,
  estimatedSavedTokens: 600,
  estimatedSavedPercent: 30,
  expanded: false,
  providerCacheEnabled: true,
}

describe("context hub provider usage", () => {
  it("stores confirmed cache usage without changing local cache counters", () => {
    expect(applyProviderUsageToStats(baseStats, {
      inputTokens: 1600,
      outputTokens: 200,
      cachedInputTokens: 800,
      cacheWriteInputTokens: 300,
    })).toEqual({
      ...baseStats,
      providerUsageReported: true,
      providerInputTokens: 1600,
      providerCachedTokens: 800,
      providerCacheWriteTokens: 300,
    })
  })

  it("把用户记忆决策作为独立统计写入上下文中控", () => {
    const decision: UserMemoryDecision = {
      createdAt: 1,
      surface: "ai-chat",
      projectKey: "p1",
      sessionKey: "s1",
      candidateCount: 8,
      selectedRuleIds: ["r1", "r2"],
      filtered: [{ ruleId: "r3", reason: "candidate" }],
      injectedChars: 240,
      estimatedTokens: 60,
    }

    expect(applyProviderUsageToStats(baseStats, { inputTokens: 100 }, decision)).toMatchObject({
      memoryCandidateCount: 8,
      memorySelectedCount: 2,
      memoryFilteredCount: 1,
      memoryInjectedChars: 240,
      memoryEstimatedTokens: 60,
    })
  })

  it("updates the persisted snapshot after the model response", async () => {
    const reference: ContextHubSnapshotRef = {
      id: "assistant:1",
      surface: "ai-chat",
      createdAt: 20,
      stats: baseStats,
    }
    const saveSnapshot = vi.fn(async () => reference)
    const result = { stats: { ...baseStats } } as ContextHubResult

    await expect(persistContextHubProviderUsage(
      { saveSnapshot },
      "assistant:1",
      result,
      { inputTokens: 1600, cachedInputTokens: 800 },
    )).resolves.toBe(reference)

    expect(result.stats).toMatchObject({
      providerUsageReported: true,
      providerInputTokens: 1600,
      providerCachedTokens: 800,
    })
    expect(saveSnapshot).toHaveBeenCalledWith("assistant:1", result)
  })
})
