import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { DeAiBatchCatalogWork } from "@/lib/novel/de-ai-batch/catalog"
import { clampDeAiBatchConcurrency } from "@/lib/novel/de-ai-batch/scheduler"

export interface DeAiBatchSelection {
  workId: string
  chapterIds: string[]
}

export interface DeAiBatchStartDialogProps {
  open: boolean
  works: DeAiBatchCatalogWork[]
  concurrency: number
  starting?: boolean
  onConcurrencyChange(value: number): void
  onStart(selection: DeAiBatchSelection[]): void | Promise<void>
  onClose(): void
}

export function DeAiBatchStartDialog({
  open,
  works,
  concurrency,
  starting = false,
  onConcurrencyChange,
  onStart,
  onClose,
}: DeAiBatchStartDialogProps) {
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})
  const startLockRef = useRef(false)

  useEffect(() => {
    if (open) {
      setSelected({})
      startLockRef.current = false
    }
  }, [open])

  const selection = useMemo(() => works.flatMap((work) => {
    const chapterIds = Array.from(selected[work.id] ?? [])
    return chapterIds.length > 0 ? [{ workId: work.id, chapterIds }] : []
  }), [selected, works])

  async function handleStart(): Promise<void> {
    if (starting || startLockRef.current || selection.length === 0) return
    startLockRef.current = true
    try {
      await onStart(selection)
    } finally {
      startLockRef.current = false
    }
  }
  function toggleWork(work: DeAiBatchCatalogWork): void {
    setSelected((current) => {
      const next = { ...current }
      const selectedCount = next[work.id]?.size ?? 0
      next[work.id] = selectedCount === work.chapters.length
        ? new Set()
        : new Set(work.chapters.map((chapter) => chapter.id))
      return next
    })
  }

  function toggleChapter(workId: string, chapterId: string): void {
    setSelected((current) => {
      const chapters = new Set(current[workId] ?? [])
      if (chapters.has(chapterId)) chapters.delete(chapterId)
      else chapters.add(chapterId)
      return { ...current, [workId]: chapters }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !starting) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-2rem)] w-[min(48rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-[calc(100vw-2rem)]"
      >
        <DialogHeader>
          <DialogTitle>新建批量去 AI 味任务</DialogTitle>
          <DialogDescription>可同时选择多个作品和章节。每个作品使用独立 Agent，超出并发数后按顺序排队。</DialogDescription>
        </DialogHeader>
        <div className="flex shrink-0 items-center gap-3 rounded-md border p-3">
          <label className="text-sm font-medium" htmlFor="de-ai-batch-concurrency">并发作品数</label>
          <Input
            id="de-ai-batch-concurrency"
            aria-label="批量去 AI 味并发数"
            type="number"
            min={1}
            max={5}
            value={concurrency}
            disabled={starting}
            onChange={(event) => onConcurrencyChange(clampDeAiBatchConcurrency(Number(event.target.value)))}
            className="w-20"
          />
          <span className="text-xs text-muted-foreground">范围 1–5，默认 3</span>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {works.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              当前项目的章节库中没有可处理章节
            </div>
          ) : works.map((work) => {
            const selectedIds = selected[work.id] ?? new Set<string>()
            return (
              <section key={work.id} className="rounded-md border" aria-label={work.title}>
                <label className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 font-medium">
                  <input
                    type="checkbox"
                    data-work-id={work.id}
                    checked={selectedIds.size === work.chapters.length && work.chapters.length > 0}
                    disabled={starting}
                    onChange={() => toggleWork(work)}
                  />
                  <span className="min-w-0 flex-1 truncate">{work.title}</span>
                  <span className="text-xs text-muted-foreground">{selectedIds.size} / {work.chapters.length} 章</span>
                </label>
                <div className="max-h-52 overflow-y-auto p-2">
                  {work.chapters.map((chapter) => (
                    <label key={chapter.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(chapter.id)}
                        disabled={starting}
                        onChange={() => toggleChapter(work.id, chapter.id)}
                      />
                      <span className="truncate">{chapter.title}</span>
                    </label>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={starting} onClick={onClose}>取消</Button>
          <Button type="button" disabled={starting || selection.length === 0} onClick={() => { void handleStart() }}>
            {starting ? "正在创建..." : `开始处理（${selection.reduce((sum, work) => sum + work.chapterIds.length, 0)} 章）`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
