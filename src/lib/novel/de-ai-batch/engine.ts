import type { DeAiBatchStorage } from "./storage"
import type {
  DeAiBatchChapter,
  DeAiBatchTask,
  DeAiBatchTaskRecord,
  DeAiBatchTaskStatus,
} from "./types"

export interface DeAiChapterRunnerInput {
  task: DeAiBatchTask
  chapter: DeAiBatchChapter
  signal: AbortSignal
}

export type DeAiChapterRunner = (input: DeAiChapterRunnerInput) => Promise<string>

export interface DeAiBatchEngineStorage {
  saveTask(task: DeAiBatchTask): Promise<void>
  saveChapter(chapter: DeAiBatchChapter, projectPath?: string): Promise<void>
}

export interface DeAiBatchEngineOptions {
  runner: DeAiChapterRunner
  storage: DeAiBatchEngineStorage | Pick<DeAiBatchStorage, "saveTask" | "saveChapter">
  now?: () => number
  id?: () => string
  onChange?: (record: DeAiBatchTaskRecord) => void
}

interface ActiveRun {
  record: DeAiBatchTaskRecord
  runId: string
  controller: AbortController
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function runKey(taskId: string, chapterId: string): string {
  return `${taskId}:${chapterId}`
}

function createRunId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function deriveTaskStatus(chapters: DeAiBatchChapter[]): DeAiBatchTaskStatus {
  if (chapters.length > 0 && chapters.every((chapter) => chapter.status === "confirmed")) return "completed"
  if (chapters.length > 0 && chapters.every((chapter) => chapter.status === "cancelled")) return "cancelled"
  const hasFailed = chapters.some((chapter) => chapter.status === "failed")
  const hasResult = chapters.some((chapter) => chapter.status === "ready" || chapter.status === "confirmed")
  const hasCancelled = chapters.some((chapter) => chapter.status === "cancelled")
  if (hasFailed && !hasResult) return "failed"
  if (hasFailed || hasCancelled) return "partial"
  return "reviewing"
}

export function createDeAiBatchEngine(options: DeAiBatchEngineOptions) {
  const now = options.now ?? Date.now
  const nextId = options.id ?? createRunId
  const activeRuns = new Map<string, ActiveRun>()
  const records = new Map<string, DeAiBatchTaskRecord>()
  let disposed = false

  function publish(record: DeAiBatchTaskRecord): void {
    options.onChange?.(record)
  }

  function replaceChapter(record: DeAiBatchTaskRecord, chapter: DeAiBatchChapter): DeAiBatchChapter {
    const index = record.chapters.findIndex((item) => item.id === chapter.id)
    if (index < 0) throw new Error(`找不到章节：${chapter.id}`)
    record.chapters[index] = chapter
    publish(record)
    return chapter
  }

  async function persistChapter(record: DeAiBatchTaskRecord, chapter: DeAiBatchChapter): Promise<void> {
    await options.storage.saveChapter(chapter, record.task.projectPath)
  }

  async function runChapter(record: DeAiBatchTaskRecord, chapterId: string): Promise<DeAiBatchChapter> {
    records.set(record.task.id, record)
    const current = record.chapters.find((chapter) => chapter.id === chapterId)
    if (!current) throw new Error(`找不到章节：${chapterId}`)
    const key = runKey(record.task.id, chapterId)
    activeRuns.get(key)?.controller.abort()
    const controller = new AbortController()
    const runId = nextId()
    const generating = replaceChapter(record, {
      ...current,
      status: "generating",
      runId,
      generation: current.generation + 1,
      error: null,
      updatedAt: now(),
    })
    activeRuns.set(key, { record, runId, controller })
    await persistChapter(record, generating)

    try {
      const candidate = await options.runner({
        task: record.task,
        chapter: generating,
        signal: controller.signal,
      })
      if (activeRuns.get(key)?.runId !== runId) {
        return record.chapters.find((chapter) => chapter.id === chapterId) ?? generating
      }
      if (!candidate.trim()) throw new Error("模型返回了空内容")
      const ready = replaceChapter(record, {
        ...generating,
        candidateContent: candidate,
        status: "ready",
        runId: null,
        error: null,
        updatedAt: now(),
      })
      await persistChapter(record, ready)
      return ready
    } catch (error) {
      if (activeRuns.get(key)?.runId !== runId) {
        return record.chapters.find((chapter) => chapter.id === chapterId) ?? generating
      }
      const cancelled = controller.signal.aborted
      const failed = replaceChapter(record, {
        ...generating,
        status: cancelled ? "cancelled" : "failed",
        runId: null,
        error: cancelled ? null : messageOf(error),
        updatedAt: now(),
      })
      await persistChapter(record, failed)
      return failed
    } finally {
      if (activeRuns.get(key)?.runId === runId) activeRuns.delete(key)
    }
  }

  async function runTask(record: DeAiBatchTaskRecord): Promise<DeAiBatchTaskRecord> {
    if (disposed) throw new Error("作品 Agent 已释放")
    records.set(record.task.id, record)
    const startedAt = record.task.startedAt ?? now()
    record.task = {
      ...record.task,
      status: "running",
      error: null,
      startedAt,
      completedAt: null,
      updatedAt: now(),
    }
    publish(record)
    await options.storage.saveTask(record.task)
    for (const chapter of [...record.chapters].sort((a, b) => a.order - b.order)) {
      if (chapter.status === "ready" || chapter.status === "confirmed" || chapter.status === "cancelled") continue
      await runChapter(record, chapter.id)
      if (disposed) return record
    }
    const status = deriveTaskStatus(record.chapters)
    record.task = {
      ...record.task,
      status,
      error: status === "failed" ? "全部章节处理失败" : null,
      completedAt: status === "completed" || status === "cancelled" ? now() : null,
      updatedAt: now(),
    }
    publish(record)
    await options.storage.saveTask(record.task)
    return record
  }

  function regenerateChapter(record: DeAiBatchTaskRecord, chapterId: string): Promise<DeAiBatchChapter> {
    return runChapter(record, chapterId)
  }

  async function cancelChapter(taskId: string, chapterId: string): Promise<void> {
    const key = runKey(taskId, chapterId)
    const active = activeRuns.get(key)
    const record = active?.record ?? records.get(taskId)
    if (!record) return
    active?.controller.abort()
    activeRuns.delete(key)
    const current = record.chapters.find((chapter) => chapter.id === chapterId)
    if (!current || current.status === "confirmed") return
    const cancelled = replaceChapter(record, {
      ...current,
      status: "cancelled",
      runId: null,
      error: null,
      updatedAt: now(),
    })
    await persistChapter(record, cancelled)
  }

  function dispose(): void {
    disposed = true
    for (const active of activeRuns.values()) active.controller.abort()
    activeRuns.clear()
    records.clear()
  }

  return { runTask, runChapter, regenerateChapter, cancelChapter, dispose }
}

export type DeAiBatchEngine = ReturnType<typeof createDeAiBatchEngine>
