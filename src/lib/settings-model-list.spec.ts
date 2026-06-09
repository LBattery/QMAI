import { afterEach, describe, expect, it, vi } from "vitest"
import type { LlmConfig } from "@/stores/wiki-store"

const fetchMock = vi.fn()

vi.mock("@/lib/tauri-fetch", () => ({
  getHttpFetch: async () => fetchMock,
}))

function customConfig(overrides: Partial<LlmConfig> = {}): LlmConfig {
  return {
    provider: "custom",
    apiKey: "sk-test",
    model: "gpt-4o",
    ollamaUrl: "http://localhost:11434",
    customEndpoint: "https://hub.linux.do/v1",
    maxContextSize: 128000,
    apiMode: "chat_completions",
    reasoning: { mode: "off" },
    ...overrides,
  }
}

afterEach(() => {
  fetchMock.mockReset()
})

describe("settings model list", () => {
  it("fetches custom OpenAI-compatible models from the normalized /models endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: "gpt-test" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    const { fetchLlmModelList } = await import("./settings-model-list")
    const result = await fetchLlmModelList(customConfig())

    expect(fetchMock).toHaveBeenCalledWith("https://hub.linux.do/v1/models", {
      method: "GET",
      headers: {
        Authorization: "Bearer sk-test",
      },
    })
    expect(result.models).toEqual(["gpt-test"])
  })

  it("retries model list 403 responses with browser-compatible OpenAI headers", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("forbidden", { status: 403 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: "linux-do-model" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )

    const { fetchLlmModelList } = await import("./settings-model-list")
    const result = await fetchLlmModelList(customConfig())

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]).toEqual([
      "https://hub.linux.do/v1/models",
      {
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
          Accept: "application/json",
          "User-Agent": expect.stringContaining("Mozilla/5.0"),
        }),
      },
    ])
    expect(result.models).toEqual(["linux-do-model"])
  })

  it("keeps the original 403 diagnostic when the compatibility retry cannot be sent", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("forbidden", { status: 403 }))
      .mockRejectedValueOnce(new TypeError("Refused to set unsafe header"))

    const { fetchLlmModelList } = await import("./settings-model-list")

    await expect(fetchLlmModelList(customConfig())).rejects.toThrow(
      "模型列表拉取失败：HTTP 403 forbidden",
    )
  })
})
