import { beforeEach, describe, expect, it, vi } from "vitest"

const persistenceMocks = vi.hoisted(() => ({
  loadAiOutlineModel: vi.fn<() => Promise<string | null>>(),
}))

vi.mock("@/lib/project-store", () => ({
  loadAiOutlineModel: persistenceMocks.loadAiOutlineModel,
}))

import { initializeAiOutlineModelFromStorage } from "@/lib/ai-outline-model-initialization"
import { useWikiStore } from "@/stores/wiki-store"

describe("AI outline model initialization", () => {
  beforeEach(() => {
    persistenceMocks.loadAiOutlineModel.mockReset()
    useWikiStore.setState({ aiOutlineModel: "" })
  })

  it("does not overwrite a user selection made while the stored value is loading", async () => {
    let resolveLoad!: (value: string | null) => void
    persistenceMocks.loadAiOutlineModel.mockReturnValue(new Promise((resolve) => {
      resolveLoad = resolve
    }))

    const revisionBeforeLoad = useWikiStore.getState().aiOutlineModelRevision
    const initialization = initializeAiOutlineModelFromStorage()
    useWikiStore.getState().setAiOutlineModel("openai/new-selection")
    expect(useWikiStore.getState().aiOutlineModelRevision).toBe(revisionBeforeLoad + 1)
    resolveLoad("openai/old-stored-selection")
    await initialization

    expect(useWikiStore.getState().aiOutlineModel).toBe("openai/new-selection")
  })

  it("applies the stored model when no newer selection is made", async () => {
    persistenceMocks.loadAiOutlineModel.mockResolvedValue("openai/stored-selection")

    await initializeAiOutlineModelFromStorage()

    expect(useWikiStore.getState().aiOutlineModel).toBe("openai/stored-selection")
  })

})
