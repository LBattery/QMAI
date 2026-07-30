// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { ConversationRunState } from "@/lib/conversation-run-state"
import { ConversationRunStatusIcon } from "./conversation-run-status-icon"

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

async function renderState(state: ConversationRunState) {
  await act(async () => { root.render(<ConversationRunStatusIcon state={state} />) })
}

describe("ConversationRunStatusIcon", () => {
  it.each([
    ["running", "正在生成"],
    ["completed_unread", "已完成，点击查看"],
    ["failed", "生成失败：接口错误"],
    ["interrupted", "任务已中断，可重新发送"],
  ] as const)("renders %s with Chinese accessible status", async (status, label) => {
    await renderState({ status, updatedAt: 1, error: "接口错误" })
    const icon = host.querySelector(`[aria-label="${label}"]`)
    expect(icon).not.toBeNull()
    expect(icon?.querySelector("svg")).not.toBeNull()
  })

  it.each([
    ["completed_unread", "已完成，点击查看"],
    ["failed", "生成失败：接口错误"],
    ["interrupted", "任务已中断，可重新发送"],
  ] as const)("shows the %s Chinese tooltip after real hover interaction", async (status, label) => {
    await renderState({ status, updatedAt: 1, error: "接口错误" })
    const icon = host.querySelector(`[aria-label="${label}"]`)
    expect(icon).not.toBeNull()

    await act(async () => {
      const pointerOver = new Event("pointerover", { bubbles: true })
      Object.defineProperty(pointerOver, "pointerType", { value: "mouse" })
      icon?.dispatchEvent(pointerOver)
      icon?.dispatchEvent(new MouseEvent("mouseenter"))
      icon?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    const tooltip = document.body.querySelector('[data-slot="tooltip-content"]')
    expect(tooltip).not.toBeNull()
    expect(tooltip?.textContent).toContain(label)
  })

  it("keeps the running status as an icon-only accessible label without a visible tooltip", async () => {
    await renderState({ status: "running", updatedAt: 1 })
    const icon = host.querySelector('[aria-label="正在生成"]')

    expect(icon).not.toBeNull()
    expect(icon?.querySelector("svg")).not.toBeNull()
    expect(icon?.textContent).toBe("")
    expect(icon?.hasAttribute("data-slot")).toBe(false)
    await act(async () => {
      icon?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
      icon?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 250))
    })
    expect(document.body.querySelector('[data-slot="tooltip-content"]')).toBeNull()
  })

  it("does not render idle status", async () => {
    await renderState({ status: "idle", updatedAt: 1 })
    expect(host.innerHTML).toBe("")
  })
})