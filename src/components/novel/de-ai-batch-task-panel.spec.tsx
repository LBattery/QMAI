// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { DeAiBatchTaskRecord, DeAiBatchTaskStatus } from "@/lib/novel/de-ai-batch/types"
import { DeAiBatchTaskPanel } from "./de-ai-batch-task-panel"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function record(status: DeAiBatchTaskStatus, id = `task-${status}`): DeAiBatchTaskRecord {
  return {
    task: {
      version: 1,
      id,
      projectPath: "C:/project",
      workId: id,
      workTitle: `作品-${status}`,
      modelKey: "openai/test",
      skillId: null,
      skillName: "默认",
      skillContent: "规则",
      status,
      chapterIds: ["c1", "c2", "c3"],
      error: status === "failed" ? "模型失败" : null,
      createdAt: 1,
      startedAt: null,
      completedAt: null,
      updatedAt: 1,
    },
    chapters: ["ready", "confirmed", "pending"].map((chapterStatus, index) => ({
      version: 1 as const,
      id: `c${index + 1}`,
      taskId: id,
      title: `第${index + 1}章`,
      order: index + 1,
      sourcePath: `C:/project/c${index + 1}.md`,
      sourceContent: "原文",
      candidateContent: index < 2 ? "候选" : null,
      status: chapterStatus as "ready" | "confirmed" | "pending",
      runId: null,
      generation: 1,
      error: null,
      createdAt: 1,
      updatedAt: 1,
    })),
  }
}

function callbacks() {
  return {
    onCollapsedChange: vi.fn(),
    onContinue: vi.fn(),
    onReview: vi.fn(),
    onCancel: vi.fn(),
  }
}

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
  vi.restoreAllMocks()
})

function render(records: DeAiBatchTaskRecord[], collapsed = false, props: ReturnType<typeof callbacks> & { pendingTaskIds?: ReadonlySet<string> } = callbacks()) {
  act(() => {
    root.render(
      <DeAiBatchTaskPanel
        records={records}
        collapsed={collapsed}
        {...props}
      />,
    )
  })
  return props
}

function click(label: string): void {
  const button = Array.from(host.querySelectorAll("button")).find((item) => item.textContent?.trim() === label)
  expect(button, `找不到按钮：${label}`).toBeTruthy()
  act(() => button?.click())
}

describe("DeAiBatchTaskPanel", () => {
  it("显示中文状态、已处理章节计数和独立滚动任务区", () => {
    render([record("running"), record("failed")])

    expect(host.textContent).toContain("批量去 AI 味")
    expect(host.textContent).toContain("处理中")
    expect(host.textContent).toContain("失败")
    expect(host.textContent).toContain("2 / 3 章")
    const list = host.querySelector('[data-testid="de-ai-batch-task-list"]')
    expect(list?.className).toContain("overflow-y-auto")
    expect(list?.className).toContain("max-h-")
  })

  it("折叠状态完全受控", () => {
    const props = render([record("running")])
    click("收起任务")
    expect(props.onCollapsedChange).toHaveBeenCalledWith(true)

    render([record("running")], true, props)
    expect(host.textContent).not.toContain("作品-running")
    click("展开任务")
    expect(props.onCollapsedChange).toHaveBeenLastCalledWith(false)
  })

  it("interrupted 和 failed 可继续，reviewing 可审核", () => {
    const props = render([record("interrupted"), record("failed"), record("reviewing")])
    const continueButtons = Array.from(host.querySelectorAll("button")).filter((button) => button.textContent?.trim() === "继续")
    act(() => continueButtons[0]?.click())
    act(() => continueButtons[1]?.click())
    const reviewingArticle = Array.from(host.querySelectorAll("article")).find((item) => item.textContent?.includes("作品-reviewing"))
    const reviewButton = Array.from(reviewingArticle?.querySelectorAll("button") ?? []).find((item) => item.textContent?.trim() === "审核")
    act(() => reviewButton?.click())

    expect(props.onContinue).toHaveBeenNthCalledWith(1, "task-interrupted")
    expect(props.onContinue).toHaveBeenNthCalledWith(2, "task-failed")
    expect(props.onReview).toHaveBeenCalledWith("task-reviewing")
  })

  it("取消使用中文确认且只传递当前任务", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    const props = render([record("queued")])

    click("取消")

    expect(confirm).toHaveBeenCalledWith("确定取消“作品-queued”的批量去 AI 味任务吗？")
    expect(props.onCancel).toHaveBeenCalledWith("task-queued")
  })

  it("拒绝确认时不取消任务", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false)
    const props = render([record("running")])

    click("取消")

    expect(props.onCancel).not.toHaveBeenCalled()
  })

  it("任务异步操作 pending 时禁用继续和取消", () => {
    render([record("failed")], false, { ...callbacks(), pendingTaskIds: new Set(["task-failed"]) })
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    expect(buttons.find((button) => button.textContent?.trim() === "继续")?.disabled).toBe(true)
    expect(buttons.find((button) => button.textContent?.trim() === "取消")?.disabled).toBe(true)
    expect(buttons.find((button) => button.textContent?.trim() === "审核")?.disabled).toBe(true)
  })
})
