import { useEffect, useMemo, useRef } from "react"
import { computeLineDiff } from "@/lib/utils/diff"

interface MonacoDiffEditorProps {
  originalValue: string
  modifiedValue: string
  onChange: (value: string) => void
  language?: string
  originalLabel?: string
  modifiedLabel?: string
  readOnly?: boolean
}

export function MonacoDiffEditor({
  originalValue,
  modifiedValue,
  onChange,
  originalLabel = "原始内容",
  modifiedLabel = "最新内容",
  readOnly = false,
}: MonacoDiffEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const preventSync = useRef(false)
  const diffLines = useMemo(
    () => computeLineDiff(originalValue, modifiedValue),
    [modifiedValue, originalValue],
  )

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    if (textarea.value !== modifiedValue) {
      preventSync.current = true
      textarea.value = modifiedValue
      preventSync.current = false
    }
  }, [modifiedValue])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const handler = () => {
      if (preventSync.current) return
      onChange(textarea.value)
    }
    textarea.addEventListener("input", handler)
    return () => textarea.removeEventListener("input", handler)
  }, [onChange])

  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-y-auto md:grid-cols-2 md:divide-x md:overflow-hidden">
      <div className="flex min-h-48 flex-col overflow-hidden border-b md:min-h-0 md:border-b-0">
        <div className="border-b bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
          {originalLabel} / 逐行差异
        </div>
        <div
          aria-label="逐行差异"
          className="min-h-0 flex-1 overflow-auto py-2 font-mono text-xs leading-relaxed"
        >
          {diffLines.length > 0 ? diffLines.map((line, index) => (
            <div
              key={`${line.type}-${line.originalLine ?? 0}-${line.modifiedLine ?? 0}-${index}`}
              data-diff-type={line.type}
              className={`grid min-w-max grid-cols-[2.5rem_2.5rem_1.5rem_minmax(12rem,1fr)] px-2 py-0.5 ${
                line.type === "add"
                  ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"
                  : line.type === "remove"
                    ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                    : "text-muted-foreground"
              }`}
            >
              <span className="select-none text-right opacity-50">{line.originalLine ?? ""}</span>
              <span className="select-none text-right opacity-50">{line.modifiedLine ?? ""}</span>
              <span className="select-none text-center opacity-70">
                {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
              </span>
              <span className="whitespace-pre-wrap break-words pl-2">{line.content || " "}</span>
            </div>
          )) : (
            <div className="px-3 py-2 text-muted-foreground">暂无差异</div>
          )}
        </div>
      </div>
      <div className="flex min-h-48 flex-col overflow-hidden md:min-h-0">
        <div className="border-b bg-muted/40 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400">
          {modifiedLabel}{readOnly ? "" : "（可编辑）"}
        </div>
        <textarea
          ref={textareaRef}
          aria-label="最新源码"
          className="flex-1 resize-none overflow-auto whitespace-pre-wrap break-words bg-transparent p-3 font-mono text-xs leading-relaxed outline-none"
          spellCheck={false}
          readOnly={readOnly}
        />
      </div>
    </div>
  )
}
