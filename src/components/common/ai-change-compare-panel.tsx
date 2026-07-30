import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Code, Eye } from "lucide-react"
import ReactMarkdown from "react-markdown"
import { MonacoDiffEditor } from "./monaco-diff-editor"
import { computeLineDiff } from "@/lib/utils/diff"

export interface AiChangeComparePanelProps {
  originalContent: string
  modifiedContent: string
  onModifiedContentChange: (content: string) => void
  editable?: boolean
  originalLabel?: string
  modifiedLabel?: string
  resetKey?: string
  className?: string
}

type ViewMode = "source" | "preview"

export function calculateAiChangeLineStats(
  originalContent: string,
  modifiedContent: string,
): { adds: number; removes: number } {
  return computeLineDiff(originalContent, modifiedContent).reduce(
    (stats, line) => {
      if (line.type === "add") stats.adds += 1
      else if (line.type === "remove") stats.removes += 1
      return stats
    },
    { adds: 0, removes: 0 },
  )
}

export function AiChangeComparePanel({
  originalContent,
  modifiedContent,
  onModifiedContentChange,
  editable = true,
  originalLabel = "原始内容",
  modifiedLabel = "最新内容",
  resetKey,
  className = "",
}: AiChangeComparePanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("source")
  const originalRef = useRef<HTMLDivElement>(null)
  const modifiedRef = useRef<HTMLDivElement>(null)
  const stats = useMemo(
    () => calculateAiChangeLineStats(originalContent, modifiedContent),
    [modifiedContent, originalContent],
  )

  useEffect(() => {
    setViewMode("source")
  }, [resetKey])

  const syncScroll = useCallback((source: "original" | "modified") => {
    if (viewMode !== "preview") return
    const sourceElement = source === "original" ? originalRef.current : modifiedRef.current
    const targetElement = source === "original" ? modifiedRef.current : originalRef.current
    if (!sourceElement || !targetElement) return
    const ratio = sourceElement.scrollTop / (sourceElement.scrollHeight - sourceElement.clientHeight || 1)
    targetElement.scrollTop = ratio * (targetElement.scrollHeight - targetElement.clientHeight)
  }, [viewMode])

  return (
    <section className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${className}`}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-xs text-muted-foreground">
          <span className="text-green-600 dark:text-green-400">+{stats.adds}</span>
          {" / "}
          <span className="text-red-500">-{stats.removes}</span>
          {" 行"}
        </span>
        <div className="flex rounded-md border text-xs">
          <button
            type="button"
            onClick={() => setViewMode("source")}
            className={`flex items-center gap-1 px-2 py-1 ${
              viewMode === "source" ? "bg-accent font-medium" : "hover:bg-accent/50"
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            {"源码对比"}
          </button>
          <button
            type="button"
            onClick={() => setViewMode("preview")}
            className={`flex items-center gap-1 px-2 py-1 ${
              viewMode === "preview" ? "bg-accent font-medium" : "hover:bg-accent/50"
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            {"渲染预览"}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {viewMode === "source" ? (
          <MonacoDiffEditor
            originalValue={originalContent}
            modifiedValue={modifiedContent}
            originalLabel={originalLabel}
            modifiedLabel={modifiedLabel}
            readOnly={!editable}
            onChange={onModifiedContentChange}
          />
        ) : (
          <div className="grid h-full min-h-0 grid-cols-1 overflow-y-auto md:grid-cols-2 md:divide-x md:overflow-hidden">
            <div className="flex min-h-48 flex-col overflow-hidden border-b md:min-h-0 md:border-b-0">
              <div className="shrink-0 border-b px-3 py-1 text-xs font-medium text-muted-foreground">
                {originalLabel}{"预览"}
              </div>
              <div
                ref={originalRef}
                onScroll={() => syncScroll("original")}
                className="prose prose-sm max-w-none flex-1 overflow-auto p-3 dark:prose-invert"
              >
                {originalContent.trim() ? (
                  <ReactMarkdown>{originalContent}</ReactMarkdown>
                ) : (
                  <span className="text-muted-foreground italic">{"（暂无原始内容）"}</span>
                )}
              </div>
            </div>
            <div className="flex min-h-48 flex-col overflow-hidden md:min-h-0">
              <div className="shrink-0 border-b px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400">
                {modifiedLabel}{"预览"}
              </div>
              <div
                ref={modifiedRef}
                onScroll={() => syncScroll("modified")}
                className="prose prose-sm max-w-none flex-1 overflow-auto p-3 dark:prose-invert"
              >
                <ReactMarkdown>{modifiedContent}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
