// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import { NovelGenerationRequestMessage } from "./novel-generation-request-message"
import { createNovelGenerationRequestPackage } from "@/lib/novel/novel-generation-request-package"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe("NovelGenerationRequestMessage", () => {
  it("默认只显示摘要，并在当前消息原地展开和收起用户详情", async () => {
    const container = document.createElement("div")
    const root = createRoot(container)
    await act(async () => root.render(<NovelGenerationRequestMessage request={{ version: 1, summary: "创建新书大纲 · 玄幻", details: ["故事灵感：废墟中的剑"], modelContent: "固定工作流" }} />))
    expect(container.textContent).toContain("创建新书大纲 · 玄幻")
    const button = container.querySelector("button")!
    expect(button.textContent).toContain("展开详情")
    await act(async () => button.click())
    expect(container.textContent).toContain("废墟中的剑")
    expect(container.textContent).not.toContain("固定工作流")
    expect(container.querySelector('[data-novel-request-details]')?.className).toContain("max-h-")
    expect(container.querySelector('[data-novel-request-details]')?.className).toContain("overflow-y-auto")
    await act(async () => button.click())
    await act(async () => root.unmount())
  })

  it("keeps legacy message content compatible", async () => {
    const { getOutlineMessageModelContent } = await import("@/lib/novel/novel-generation-request-package")
    expect(getOutlineMessageModelContent({ content: "legacy message content" })).toBe("legacy message content")
  })
  it("renders UTF-8 Chinese detail labels without question-mark corruption", async () => {
    const request = createNovelGenerationRequestPackage({
      task: "newBook", length: "long", channel: "male", genre: "xuanhuan", customGenre: "",
      inspiration: "遗迹中的剑", sellingPoints: ["升级变强"], targets: ["总纲"], scale: "",
      narrative: "thirdPerson", materialSource: "none",
      explicit: { length: true, channel: true, genre: true, sellingPoints: true },
    }, "model workflow")
    const container = document.createElement("div")
    const root = createRoot(container)
    await act(async () => root.render(<NovelGenerationRequestMessage request={request} />))
    await act(async () => container.querySelector("button")!.click())
    expect(container.textContent).toContain("篇幅类型：长篇小说")
    expect(container.textContent).toContain("核心卖点：升级变强")
    expect(container.textContent).not.toContain("?")
    await act(async () => root.unmount())
  })

  it("keeps details associated while toggling aria-expanded false true false", async () => {
    const container = document.createElement("div")
    const root = createRoot(container)
    await act(async () => root.render(<NovelGenerationRequestMessage request={{ version: 1, summary: "summary", details: ["detail"], modelContent: "model" }} />))
    const button = container.querySelector("button")!
    const details = container.querySelector<HTMLElement>('[data-novel-request-details]')!
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(button.getAttribute("aria-controls")).toBe(details.id)
    expect(details.hidden).toBe(true)
    await act(async () => button.click())
    expect(button.getAttribute("aria-expanded")).toBe("true")
    expect(details.hidden).toBe(false)
    await act(async () => button.click())
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(details.hidden).toBe(true)
    await act(async () => root.unmount())
  })

})
