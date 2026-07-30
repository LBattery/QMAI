// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DeAiBatchStartDialog } from "./de-ai-batch-start-dialog"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const works = [
  { id: "work-a", title: "作品甲", chapters: [{ id: "a-1", title: "第一章", order: 1, sourcePath: "C:/a/1.md" }] },
  { id: "work-b", title: "作品乙", chapters: [{ id: "b-1", title: "第一章", order: 1, sourcePath: "C:/b/1.md" }] },
]

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe("DeAiBatchStartDialog", () => {
  it("可选择多个作品/章节并设置 1–5 并发", () => {
    const onStart = vi.fn()
    const onConcurrencyChange = vi.fn()
    act(() => root.render(
      <DeAiBatchStartDialog
        open
        works={works}
        concurrency={3}
        onConcurrencyChange={onConcurrencyChange}
        onStart={onStart}
        onClose={vi.fn()}
      />,
    ))

    const workCheckboxes = Array.from(document.body.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-work-id]'))
    act(() => workCheckboxes.forEach((checkbox) => checkbox.click()))
    const concurrency = document.body.querySelector<HTMLInputElement>('input[aria-label="批量去 AI 味并发数"]')
    expect(concurrency?.min).toBe("1")
    expect(concurrency?.max).toBe("5")
    act(() => {
      if (concurrency) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(concurrency, "5")
        concurrency.dispatchEvent(new Event("input", { bubbles: true }))
      }
    })
    const start = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent?.includes("开始处理"))
    act(() => start?.click())

    expect(onConcurrencyChange).toHaveBeenCalledWith(5)
    expect(onStart).toHaveBeenCalledWith([
      { workId: "work-a", chapterIds: ["a-1"] },
      { workId: "work-b", chapterIds: ["b-1"] },
    ])
  })
  it("同步锁阻止开始按钮双击重复提交", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const onStart = vi.fn(async () => gate)
    act(() => root.render(
      <DeAiBatchStartDialog open works={works} concurrency={3} onConcurrencyChange={vi.fn()} onStart={onStart} onClose={vi.fn()} />,
    ))
    const workCheckbox = document.body.querySelector<HTMLInputElement>('input[type="checkbox"][data-work-id="work-a"]')
    act(() => workCheckbox?.click())
    const start = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent?.includes("开始处理"))
    act(() => {
      start?.click()
      start?.click()
    })
    expect(onStart).toHaveBeenCalledTimes(1)
    release()
    await act(async () => { await gate })
  })

  it("starting 时禁用选择、并发、提交和关闭", () => {
    const onClose = vi.fn()
    act(() => root.render(
      <DeAiBatchStartDialog open starting works={works} concurrency={3} onConcurrencyChange={vi.fn()} onStart={vi.fn()} onClose={onClose} />,
    ))
    const inputs = Array.from(document.body.querySelectorAll<HTMLInputElement>("input"))
    expect(inputs.length).toBeGreaterThan(0)
    expect(inputs.every((input) => input.disabled)).toBe(true)
    const buttons = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
    expect(buttons.filter((button) => button.textContent?.includes("开始处理") || button.textContent === "取消").every((button) => button.disabled)).toBe(true)
  })
})
