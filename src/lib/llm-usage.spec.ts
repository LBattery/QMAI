import { describe, expect, it } from "vitest"
import type { LlmConfig } from "@/stores/wiki-store"
import { getProviderConfig } from "./llm-providers"
import { addLlmUsage, mergeLlmUsageSnapshot } from "./llm-usage"

function config(provider: LlmConfig["provider"], overrides: Partial<LlmConfig> = {}): LlmConfig {
  return {
    provider,
    apiKey: "sk-test",
    model: "test-model",
    ollamaUrl: "http://localhost:11434",
    customEndpoint: "https://example.test/v1",
    maxContextSize: 128_000,
    ...overrides,
  }
}

describe("provider token usage parsing", () => {
  it("parses OpenAI cached prompt tokens", () => {
    const usage = getProviderConfig(config("openai")).parseUsage(
      'data: {"choices":[],"usage":{"prompt_tokens":1200,"completion_tokens":80,"total_tokens":1280,"prompt_tokens_details":{"cached_tokens":1024}}}',
    )

    expect(usage).toEqual({
      inputTokens: 1200,
      outputTokens: 80,
      totalTokens: 1280,
      cachedInputTokens: 1024,
    })
  })

  it("parses Anthropic cache reads and cache writes into total input", () => {
    const usage = getProviderConfig(config("anthropic")).parseUsage(
      'data: {"type":"message_start","message":{"usage":{"input_tokens":200,"cache_creation_input_tokens":300,"cache_read_input_tokens":500}}}',
    )

    expect(usage).toEqual({
      inputTokens: 1000,
      cachedInputTokens: 500,
      cacheWriteInputTokens: 300,
    })
  })

  it("parses Gemini cached content usage", () => {
    const usage = getProviderConfig(config("google")).parseUsage(
      'data: {"candidates":[],"usageMetadata":{"promptTokenCount":900,"candidatesTokenCount":100,"totalTokenCount":1000,"cachedContentTokenCount":600}}',
    )

    expect(usage).toEqual({
      inputTokens: 900,
      outputTokens: 100,
      totalTokens: 1000,
      cachedInputTokens: 600,
    })
  })

  it("parses Responses API cached input tokens", () => {
    const usage = getProviderConfig(config("custom", { apiMode: "responses" })).parseUsage(
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":1100,"output_tokens":100,"total_tokens":1200,"input_tokens_details":{"cached_tokens":800}}}}',
    )

    expect(usage).toEqual({
      inputTokens: 1100,
      outputTokens: 100,
      totalTokens: 1200,
      cachedInputTokens: 800,
    })
  })
})

describe("LLM usage aggregation", () => {
  it("keeps the largest cumulative snapshot within one stream", () => {
    const usage = mergeLlmUsageSnapshot(
      { inputTokens: 800, outputTokens: 20, cachedInputTokens: 400 },
      { inputTokens: 800, outputTokens: 60, cachedInputTokens: 400 },
    )

    expect(usage).toEqual({ inputTokens: 800, outputTokens: 60, cachedInputTokens: 400 })
  })

  it("adds separate billable requests without inventing missing cache details", () => {
    const usage = addLlmUsage(
      { inputTokens: 800, outputTokens: 60, cachedInputTokens: 400 },
      { inputTokens: 500, outputTokens: 40 },
    )

    expect(usage).toEqual({ inputTokens: 1300, outputTokens: 100, cachedInputTokens: 400 })
  })
})
