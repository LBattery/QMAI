import { beforeEach, describe, expect, it, vi } from "vitest"

const storeMocks = vi.hoisted(() => {
  const values = new Map<string, unknown>()
  return {
    values,
    get: vi.fn(async (key: string) => values.get(key)),
    set: vi.fn(async (key: string, value: unknown) => { values.set(key, value) }),
  }
})

vi.mock("@/lib/web-store", () => ({
  getStore: vi.fn(async () => ({ get: storeMocks.get, set: storeMocks.set })),
}))

import {
  loadAiOutlineModel,
  saveAiOutlineModel,
} from "@/lib/project-store"

describe("AI outline model persistence", () => {
  beforeEach(() => {
    storeMocks.values.clear()
    storeMocks.get.mockClear()
    storeMocks.set.mockClear()
  })

  it("saves and restores a stable provider/model id under the outline-only key", async () => {
    await saveAiOutlineModel("openai/gpt-4o")

    expect(storeMocks.set).toHaveBeenCalledWith("aiOutlineModel", "openai/gpt-4o")
    expect(storeMocks.values.has("aiChatModel")).toBe(false)
    expect(storeMocks.values.has("defaultLlmModel")).toBe(false)
    await expect(loadAiOutlineModel()).resolves.toBe("openai/gpt-4o")
  })

  it("keeps the latest model on disk when pending writes finish in reverse order", async () => {
    const pendingWrites: Array<{ value: unknown; resolve: () => void }> = []
    storeMocks.set.mockImplementation(async (key: string, value: unknown) => {
      await new Promise<void>((resolve) => {
        pendingWrites.push({
          value,
          resolve: () => {
            storeMocks.values.set(key, value)
            resolve()
          },
        })
      })
    })

    const fallbackSave = saveAiOutlineModel("openai/fallback-model")
    const manualSave = saveAiOutlineModel("anthropic/manual-model")
    for (let attempt = 0; attempt < 20 && pendingWrites.length < 2; attempt += 1) {
      await Promise.resolve()
    }
    expect(pendingWrites.map((write) => write.value)).toEqual([
      "openai/fallback-model",
      "anthropic/manual-model",
    ])

    pendingWrites[1].resolve()
    await Promise.resolve()
    pendingWrites[0].resolve()
    for (let attempt = 0; attempt < 20 && pendingWrites.length < 3; attempt += 1) {
      await Promise.resolve()
    }
    expect(pendingWrites[2]?.value).toBe("anthropic/manual-model")
    pendingWrites[2].resolve()
    await Promise.all([fallbackSave, manualSave])

    expect(storeMocks.values.get("aiOutlineModel")).toBe("anthropic/manual-model")
  })

})
