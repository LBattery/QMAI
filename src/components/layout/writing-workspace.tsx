import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react"
import { PreviewPanel } from "./preview-panel"
import { clampChatWidth, getInitialChatWidth } from "@/lib/workspace-layout"
import { useWikiStore } from "@/stores/wiki-store"

const ChatPanel = lazy(async () => {
  const mod = await import("@/components/chat/chat-panel")
  return { default: mod.ChatPanel }
})

export function WritingWorkspace() {
  const containerRef = useRef<HTMLDivElement>(null)
  const horizontalResizingRef = useRef(false)
  const chatExpanded = useWikiStore((s) => s.chatExpanded)
  const [chatWidth, setChatWidth] = useState(() => getInitialChatWidth())

  useEffect(() => {
    const savedWidth = Number(localStorage.getItem("lk-chat-right-width"))
    setChatWidth(getInitialChatWidth(savedWidth))
  }, [])

  useEffect(() => {
    localStorage.setItem("lk-chat-right-width", String(chatWidth))
  }, [chatWidth])

  // 窗口缩小时自动 clamp 面板宽度，避免面板超出窗口
  useEffect(() => {
    const handleResize = () => {
      setChatWidth((prev) => {
        const clamped = clampChatWidth(prev)
        return clamped !== prev ? clamped : prev
      })
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const startHorizontalResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    horizontalResizingRef.current = true
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    document.body.dataset.panelResizing = "true"

    const handleMouseMove = (nextEvent: MouseEvent) => {
      if (!horizontalResizingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const nextWidth = rect.right - nextEvent.clientX
      setChatWidth(clampChatWidth(nextWidth))
    }

    const handleMouseUp = () => {
      horizontalResizingRef.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      delete document.body.dataset.panelResizing
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }, [])

  if (chatExpanded) {
    return (
      <div ref={containerRef} className="flex h-full min-h-0 overflow-hidden bg-background">
        <div className="min-w-0 min-h-0 flex-1 overflow-hidden">
          <PreviewPanel />
        </div>
        <div
          className="w-1.5 shrink-0 cursor-col-resize bg-border/40 transition-colors hover:bg-primary/30 active:bg-primary/40"
          onMouseDown={startHorizontalResize}
        />
        <div className="h-full min-h-0 shrink-0 overflow-hidden border-l bg-background" style={{ width: chatWidth }}>
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading...</div>}>
            <ChatPanel />
          </Suspense>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-0 overflow-hidden bg-background">
      <div className="min-w-0 min-h-0 flex-1 overflow-hidden">
        <PreviewPanel />
      </div>
    </div>
  )
}
