import { ChevronDown, ChevronUp, Layers3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { DeAiBatchTaskRecord, DeAiBatchTaskStatus } from "@/lib/novel/de-ai-batch/types"

const STATUS_LABELS: Record<DeAiBatchTaskStatus, string> = {
  queued: "等待中",
  running: "处理中",
  reviewing: "待审核",
  partial: "部分完成",
  interrupted: "已中断",
  failed: "失败",
  cancelled: "已取消",
  completed: "已完成",
}

const CONTINUE_STATUSES = new Set<DeAiBatchTaskStatus>(["interrupted", "failed", "partial"])
const CANCELLABLE_STATUSES = new Set<DeAiBatchTaskStatus>([
  "queued",
  "running",
  "reviewing",
  "partial",
  "interrupted",
  "failed",
])

export interface DeAiBatchTaskPanelProps {
  records: DeAiBatchTaskRecord[]
  collapsed: boolean
  pendingTaskIds?: ReadonlySet<string>
  onCollapsedChange(collapsed: boolean): void
  onContinue(taskId: string): void
  onReview(taskId: string): void
  onCancel(taskId: string): void
}

function completedCount(record: DeAiBatchTaskRecord): number {
  return record.chapters.filter((chapter) => chapter.status !== "pending" && chapter.status !== "generating").length
}

function canReview(record: DeAiBatchTaskRecord): boolean {
  return record.chapters.some((chapter) => chapter.status === "ready" || chapter.status === "confirmed")
}

export function DeAiBatchTaskPanel({
  records,
  collapsed,
  pendingTaskIds = new Set(),
  onCollapsedChange,
  onContinue,
  onReview,
  onCancel,
}: DeAiBatchTaskPanelProps) {
  if (records.length === 0) return null

  return (
    <section className="rounded-lg border bg-card" aria-label="批量去 AI 味任务">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Layers3 className="h-4 w-4 shrink-0 text-primary" />
          <span>批量去 AI 味</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{records.length}</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-controls="de-ai-batch-task-list"
          aria-expanded={!collapsed}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          {collapsed ? "展开任务" : "收起任务"}
        </Button>
      </div>
      {!collapsed ? (
        <div
          id="de-ai-batch-task-list"
          data-testid="de-ai-batch-task-list"
          className="max-h-72 space-y-2 overflow-y-auto p-3"
        >
          {records.map((record) => {
            const task = record.task
            const finished = completedCount(record)
            return (
              <article key={task.id} className="rounded-md border p-3" aria-label={`${task.workTitle}任务`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium" title={task.workTitle}>{task.workTitle}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{STATUS_LABELS[task.status]}</span>
                      <span>{finished} / {record.chapters.length} 章</span>
                    </div>
                    {task.error ? (
                      <p className="mt-1 truncate text-xs text-destructive" title={task.error}>{task.error}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {CONTINUE_STATUSES.has(task.status) ? (
                      <Button type="button" size="sm" variant="outline" disabled={pendingTaskIds.has(task.id)} onClick={() => onContinue(task.id)}>
                        继续
                      </Button>
                    ) : null}
                    {canReview(record) ? (
                      <Button type="button" size="sm" variant="outline" disabled={pendingTaskIds.has(task.id)} onClick={() => onReview(task.id)}>
                        审核
                      </Button>
                    ) : null}
                    {CANCELLABLE_STATUSES.has(task.status) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pendingTaskIds.has(task.id)}
                        onClick={() => {
                          if (window.confirm(`确定取消“${task.workTitle}”的批量去 AI 味任务吗？`)) {
                            onCancel(task.id)
                          }
                        }}
                      >
                        取消
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
