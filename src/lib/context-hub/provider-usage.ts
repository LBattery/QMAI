import type { LlmUsage } from "@/lib/llm-usage"
import { getLatestUserMemoryDecision, type UserMemoryDecision } from "@/lib/user-memory/decision-trace"
import type {
  ContextHub,
  ContextHubResult,
  ContextHubSnapshotRef,
  ContextHubStats,
} from "./types"

export function applyProviderUsageToStats(
  stats: ContextHubStats,
  usage: LlmUsage,
  memoryDecision?: UserMemoryDecision | null,
): ContextHubStats {
  return {
    ...stats,
    providerUsageReported: true,
    ...(usage.inputTokens !== undefined ? { providerInputTokens: usage.inputTokens } : {}),
    ...(usage.cachedInputTokens !== undefined ? { providerCachedTokens: usage.cachedInputTokens } : {}),
    ...(usage.cacheWriteInputTokens !== undefined
      ? { providerCacheWriteTokens: usage.cacheWriteInputTokens }
      : {}),
    ...(memoryDecision ? {
      memoryCandidateCount: memoryDecision.candidateCount,
      memorySelectedCount: memoryDecision.selectedRuleIds.length,
      memoryFilteredCount: memoryDecision.filtered.length,
      memoryInjectedChars: memoryDecision.injectedChars,
      memoryEstimatedTokens: memoryDecision.estimatedTokens,
    } : {}),
  }
}

export async function persistContextHubProviderUsage(
  contextHub: Pick<ContextHub, "saveSnapshot">,
  snapshotId: string,
  result: ContextHubResult,
  usage: LlmUsage | undefined,
): Promise<ContextHubSnapshotRef | null> {
  if (!usage) return null
  result.stats = applyProviderUsageToStats(result.stats, usage, getLatestUserMemoryDecision())
  return contextHub.saveSnapshot(snapshotId, result)
}
