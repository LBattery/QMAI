// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"
import { TextTransformPreviewDialog } from "./text-transform-preview-dialog"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe("TextTransformPreviewDialog", () => {
  it("renders generated content as editable when a change handler is provided", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        <TextTransformPreviewDialog
          open
          title="AI修改预览"
          sourceLabel="补写位置"
          candidateLabel="AI补写内容"
          sourceContent="原文"
          candidateContent="AI生成内容"
          applyLabel="确认替换"
          onApply={() => {}}
          onClose={() => {}}
          onCandidateContentChange={vi.fn()}
        />,
      )
    })

    const textarea = document.body.querySelector("textarea")
    expect(textarea).not.toBeNull()
    expect(textarea?.value).toBe("AI生成内容")

    act(() => root.unmount())
    document.body.removeChild(container)
  })

  it("renders the shared editable comparison workspace when comparison mode is enabled", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    const onCandidateContentChange = vi.fn()

    act(() => {
      root.render(
        <TextTransformPreviewDialog
          open
          title={"\u53bbAI\u5473\u9884\u89c8"}
          sourceLabel={"\u539f\u6587\u7247\u6bb5"}
          candidateLabel={"\u53bbAI\u5473\u7ed3\u679c"}
          sourceContent="old paragraph"
          candidateContent="new paragraph"
          applyLabel={"\u66ff\u6362\u9009\u4e2d\u6587\u672c"}
          comparisonMode
          onApply={() => {}}
          onClose={() => {}}
          onCandidateContentChange={onCandidateContentChange}
        />,
      )
    })

    expect(document.body.textContent).toContain("\u6e90\u7801\u5bf9\u6bd4")
    expect(document.body.textContent).toContain("\u6e32\u67d3\u9884\u89c8")
    const editor = document.body.querySelector<HTMLTextAreaElement>('textarea[aria-label="\u6700\u65b0\u6e90\u7801"]')
    expect(editor).not.toBeNull()
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      setter?.call(editor, "user-edited paragraph")
      editor!.dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(onCandidateContentChange).toHaveBeenCalledWith("user-edited paragraph")

    act(() => root.unmount())
    document.body.removeChild(container)
  })

})
