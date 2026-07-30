// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { FileNode } from "@/types/wiki"
import { useWikiStore } from "@/stores/wiki-store"
import { useOutlineGenerationStore } from "@/stores/outline-generation-store"
import { OutlineWorkbench } from "./outline-workbench"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

const { createDirectoryMock, listDirectoryMock } = vi.hoisted(() => ({
  createDirectoryMock: vi.fn(async () => undefined),
  listDirectoryMock: vi.fn(),
}))

vi.mock("@/commands/fs", () => ({
  createDirectory: createDirectoryMock,
  listDirectory: listDirectoryMock,
  copyFile: vi.fn(async () => undefined),
  deleteFile: vi.fn(async () => undefined),
  fileExists: vi.fn(async () => false),
}))

vi.mock("@/components/layout/preview-panel", () => ({
  PreviewPanel: () => <div data-testid="mock-preview-panel">大纲显示与编辑区</div>,
}))

vi.mock("@/components/sources/outline-chat-panel", () => ({
  OutlineChatPanel: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="mock-outline-chat-panel">
      AI 大纲对话区
      <button type="button" onClick={onClose}>关闭AI大纲</button>
    </div>
  ),
}))

const outlineNodes: FileNode[] = [
  {
    name: "章纲文件夹",
    path: "C:/Book/wiki/outlines/章纲文件夹",
    is_dir: true,
    children: [
      {
        name: "章纲-第001章.md",
        path: "C:/Book/wiki/outlines/章纲文件夹/章纲-第001章.md",
        is_dir: false,
      },
    ],
  },
]

describe("OutlineWorkbench", () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    createDirectoryMock.mockClear()
    listDirectoryMock.mockClear()
    listDirectoryMock.mockResolvedValue(outlineNodes)
    useWikiStore.setState({
      project: { id: "p1", name: "测试书", path: "C:/Book" },
      fileTree: [],
      selectedFile: null,
      fileContent: "",
    })
    useOutlineGenerationStore.setState({ panelOpen: true })
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it("主内容区只渲染中间编辑区和右侧 50% AI 大纲对话区，并提供拖拽条", async () => {
    await act(async () => {
      root.render(<OutlineWorkbench />)
    })

    expect(host.querySelector('[data-testid="outline-workbench"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="outline-tree-pane"]')).toBeNull()
    expect(host.querySelector('[data-testid="outline-editor-pane"]')).not.toBeNull()
    const aiPane = host.querySelector('[data-testid="outline-ai-pane"]') as HTMLElement
    expect(aiPane).not.toBeNull()
    expect(aiPane.style.width).toBe("50%")
    expect(host.querySelector('[data-testid="outline-ai-resize-handle"]')).not.toBeNull()
    expect(host.textContent).toContain("大纲显示与编辑区")
    expect(host.textContent).toContain("AI 大纲对话区")
    expect(host.textContent).not.toContain("大纲文件树")
  })

  it("关闭 AI 大纲面板后隐藏右侧面板和拖拽条", async () => {
    await act(async () => {
      root.render(<OutlineWorkbench />)
    })

    const closeButton = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("关闭AI大纲"),
    )
    await act(async () => {
      closeButton?.click()
    })

    expect(host.querySelector('[data-testid="outline-ai-pane"]')).toBeNull()
    expect(host.querySelector('[data-testid="outline-ai-resize-handle"]')).toBeNull()
    expect(host.querySelector('[data-testid="mock-preview-panel"]')).not.toBeNull()
  })

  it("跟随 AI 大纲面板开关状态显示或隐藏右侧面板", async () => {
    useOutlineGenerationStore.setState({ panelOpen: false })

    await act(async () => {
      root.render(<OutlineWorkbench />)
    })

    expect(host.querySelector('[data-testid="outline-ai-pane"]')).toBeNull()
    expect(host.querySelector('[data-testid="mock-preview-panel"]')).not.toBeNull()
  })

  it("主内容区不再负责创建默认文件夹和读取大纲目录", async () => {
    await act(async () => {
      root.render(<OutlineWorkbench />)
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(createDirectoryMock).not.toHaveBeenCalled()
    expect(listDirectoryMock).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain("章纲-第001章.md")
  })
})
