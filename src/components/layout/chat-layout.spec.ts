import { describe, expect, it } from "vitest"
import { getNextChatExpanded } from "./chat-layout"

describe("chat layout", () => {
  it("toggles chat expanded state", () => {
    expect(getNextChatExpanded(true)).toBe(false)
    expect(getNextChatExpanded(false)).toBe(true)
  })
})
