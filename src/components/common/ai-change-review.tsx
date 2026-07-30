import { useState, useMemo, useCallback, useEffect } from "react"
import { X, Check, FileText } from "lucide-react"
import { AiChangeComparePanel } from "./ai-change-compare-panel"

export interface AiChangeReviewItem {
  id: string
  fileName: string
  originalContent: string
  modifiedContent: string
  selected: boolean
  error?: string
  targetFolder?: string
  writeMode?: string
}

interface AiChangeReviewProps {
  open: boolean
  title: string
  items: AiChangeReviewItem[]
  onClose: () => void
  onConfirm: (items: AiChangeReviewItem[]) => void
  description?: string
}

export function AiChangeReview({
  open,
  title,
  items: initialItems,
  onClose,
  onConfirm,
  description,
}: AiChangeReviewProps) {
  const [items, setItems] = useState<AiChangeReviewItem[]>(initialItems)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setItems(initialItems)
      setActiveId(initialItems[0]?.id ?? null)
      setSaving(false)
    }
  }, [open, initialItems])

  const activeItem = useMemo(
    () => items.find((item) => item.id === activeId) ?? null,
    [items, activeId],
  )

  const selectedCount = useMemo(
    () => items.filter((item) => item.selected).length,
    [items],
  )

  const handleModifiedChange = useCallback(
    (value: string) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === activeId ? { ...item, modifiedContent: value } : item,
        ),
      )
    },
    [activeId],
  )

  const handleToggle = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item,
      ),
    )
  }, [])

  const handleConfirm = useCallback(() => {
    if (saving) return
    setSaving(true)
    onConfirm(items.filter((item) => item.selected))
  }, [items, onConfirm, saving])

  if (!open) return null

  const isNew = !activeItem?.originalContent.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[85vh] w-full max-w-7xl flex-col rounded-lg border bg-background shadow-2xl">
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            <div>
              <h3 className="font-semibold">{title}</h3>
              {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-md p-1 hover:bg-accent"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 主体：文件栏 + 工作区 */}
        <div className="flex min-h-0 flex-1">
          {/* 左侧文件栏 */}
          {items.length > 1 && (
            <div className="w-40 shrink-0 border-r bg-muted/20 px-2 py-3">
              <div className="mb-2 text-[10px] font-medium text-muted-foreground px-1">
                待写入文件
              </div>
              {items.map((item) => (
                <label
                  key={item.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent ${
                    activeId === item.id ? "bg-accent/60" : ""
                  }`}
                >
                  <input
                    aria-label={`保存 ${item.fileName}`}
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => handleToggle(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
                  />
                  <span
                    className="min-w-0 flex-1 truncate"
                    onClick={() => setActiveId(item.id)}
                  >
                    {item.fileName}
                    {!item.originalContent.trim() && (
                      <span className="ml-1 text-[10px] text-blue-500">新建</span>
                    )}
                    {item.error && (
                      <span className="block text-[10px] text-red-500">{item.error}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* 中央工作区 */}
          <div className="flex min-w-0 flex-1 flex-col">
            {activeItem ? (
              <>
                <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
                  <span className="font-medium">{activeItem.fileName}</span>
                  {isNew && (
                    <span className="text-blue-600 dark:text-blue-400">新建文件</span>
                  )}
                </div>

                <AiChangeComparePanel
                  originalContent={activeItem.originalContent}
                  modifiedContent={activeItem.modifiedContent}
                  onModifiedContentChange={handleModifiedChange}
                  resetKey={activeItem.id}
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                请从左侧选择文件
              </div>
            )}
          </div>
        </div>

        {/* 底部栏 */}
        <div className="flex items-center justify-between border-t px-4 py-3">
          <span className="text-xs text-muted-foreground">
            将保存 {selectedCount} 个文件
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border px-4 py-1.5 text-sm hover:bg-accent"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedCount === 0 || saving}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="h-4 w-4" />
              确认保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
