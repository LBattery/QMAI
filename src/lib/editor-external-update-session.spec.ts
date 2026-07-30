import { describe, expect, it, vi } from "vitest"
import {
  registerEditorExternalUpdateHandler,
  requestEditorExternalChapterBodyUpdate,
} from "./editor-external-update-session"

describe("editor external update session", () => {
  it("旧注册者的 disposer 不会清除后注册的新 handler", async () => {
    const oldHandler = vi.fn(async () => true)
    const newHandler = vi.fn(async () => true)
    const disposeOld = registerEditorExternalUpdateHandler(oldHandler)
    const disposeNew = registerEditorExternalUpdateHandler(newHandler)
    disposeOld()
    await expect(requestEditorExternalChapterBodyUpdate("C:/project/wiki/chapters/1.md", "候选")).resolves.toBe(true)
    expect(oldHandler).not.toHaveBeenCalled()
    expect(newHandler).toHaveBeenCalledTimes(1)
    disposeNew()
    await expect(requestEditorExternalChapterBodyUpdate("C:/project/wiki/chapters/1.md", "候选")).resolves.toBe(false)
  })
})