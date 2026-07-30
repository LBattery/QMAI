// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"
import { MonacoDiffEditor } from "./monaco-diff-editor"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe("MonacoDiffEditor", () => {
  it("aligns inserted lines as a real line diff while keeping the candidate editable", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const onChange = vi.fn()

    act(() => {
      root.render(
        <MonacoDiffEditor
          originalValue={"A\nB"}
          modifiedValue={"X\nA\nB"}
          onChange={onChange}
        />,
      )
    })

    expect(document.body.querySelectorAll('[data-diff-type="add"]')).toHaveLength(1)
    expect(document.body.querySelectorAll('[data-diff-type="remove"]')).toHaveLength(0)
    expect(document.body.querySelectorAll('[data-diff-type="unchanged"]')).toHaveLength(2)
    expect(document.body.querySelector('[data-diff-type="add"]')?.textContent).toContain("X")

    const editor = document.body.querySelector<HTMLTextAreaElement>('textarea[aria-label="最新源码"]')
    expect(editor?.value).toBe("X\nA\nB")
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      setter?.call(editor, "edited")
      editor!.dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith("edited")

    act(() => root.unmount())
    host.remove()
  })
})
