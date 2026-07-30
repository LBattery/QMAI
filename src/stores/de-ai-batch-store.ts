import { create } from "zustand"
import { createDeAiBatchChapterApplier } from "@/lib/novel/de-ai-batch/chapter-apply"
import { assertChapterSourcePath } from "@/lib/novel/de-ai-batch/chapter-path"
import { createDefaultDeAiBatchLlmRunner, getDeAiBatchTaskModelError } from "@/lib/novel/de-ai-batch/llm-runner"
import {
  createDeAiBatchEngine,
  type DeAiBatchEngine,
  type DeAiBatchEngineStorage,
  type DeAiChapterRunner,
} from "@/lib/novel/de-ai-batch/engine"
import {
  createDeAiBatchScheduler,
  type DeAiBatchScheduler,
  type DeAiBatchSchedulerSnapshot,
} from "@/lib/novel/de-ai-batch/scheduler"
import {
  createDeAiBatchStorage,
  type DeAiBatchStorage,
} from "@/lib/novel/de-ai-batch/storage"
import type {
  CreateDeAiBatchTaskInput,
  DeAiBatchChapter,
  DeAiBatchTask,
  DeAiBatchTaskRecord,
} from "@/lib/novel/de-ai-batch/types"

const EMPTY_SCHEDULER: DeAiBatchSchedulerSnapshot = {
  concurrency: 3,
  activeTaskIds: [],
  queuedTaskIds: [],
  disposed: false,
}

interface StoreStorage extends DeAiBatchEngineStorage {
  loadProject(projectPath: string): Promise<DeAiBatchTaskRecord[]>
  createTask(input: CreateDeAiBatchTaskInput): Promise<DeAiBatchTaskRecord>
}

interface ProjectContext {
  generation: number
  projectPath: string
}

export interface CreateDeAiBatchStoreOptions {
  storage?: StoreStorage | DeAiBatchStorage
  runner: DeAiChapterRunner
  validateTaskModel?: (task: DeAiBatchTask) => string | null
  applyChapter?: (path: string, content: string) => Promise<void>
  concurrency?: number
  now?: () => number
}

export interface DeAiBatchState {
  projectPath: string | null
  records: DeAiBatchTaskRecord[]
  concurrency: number
  scheduler: DeAiBatchSchedulerSnapshot
  panelCollapsed: boolean
  reviewOpen: boolean
  reviewTaskId: string | null
  reviewChapterId: string | null
  initializeProject(projectPath: string): Promise<void>
  createBatch(inputs: CreateDeAiBatchTaskInput[]): Promise<void>
  continueTask(taskId: string): Promise<boolean>
  regenerateChapter(taskId: string, chapterId: string): Promise<boolean>
  cancelChapter(taskId: string, chapterId: string): Promise<boolean>
  confirmChapter(taskId: string, chapterId: string, candidateContent?: string): Promise<boolean>
  cancelTask(taskId: string): Promise<boolean>
  openReview(taskId: string, chapterId?: string): void
  closeReview(): void
  setReviewChapter(chapterId: string): void
  setPanelCollapsed(collapsed: boolean): void
  setConcurrency(value: number): void
  dispose(): void
}

function taskAfterChapterChange(
  task: DeAiBatchTask,
  chapters: DeAiBatchChapter[],
  now: number,
): DeAiBatchTask {
  const allConfirmed = chapters.length > 0 && chapters.every((chapter) => chapter.status === "confirmed")
  const hasFailedOrCancelled = chapters.some((chapter) => chapter.status === "failed" || chapter.status === "cancelled")
  return {
    ...task,
    status: allConfirmed ? "completed" : hasFailedOrCancelled ? "partial" : "reviewing",
    completedAt: allConfirmed ? now : null,
    error: null,
    updatedAt: now,
  }
}

export function createDeAiBatchStore(options: CreateDeAiBatchStoreOptions) {
  const storage = options.storage ?? createDeAiBatchStorage()
  const applyChapter = options.applyChapter ?? createDeAiBatchChapterApplier()
  const now = options.now ?? Date.now
  const validateTaskModel = options.validateTaskModel ?? getDeAiBatchTaskModelError
  let scheduler: DeAiBatchScheduler | null = null
  const engines = new Map<string, DeAiBatchEngine>()
  let generation = 0
  const chapterActions = new Map<string, symbol>()
  const taskActions = new Map<string, symbol>()

  return create<DeAiBatchState>((set, get) => {
    function captureProjectContext(projectPath: string): ProjectContext | null {
      return get().projectPath === projectPath ? { generation, projectPath } : null
    }

    function isProjectContextCurrent(context: ProjectContext): boolean {
      return generation === context.generation && get().projectPath === context.projectPath
    }

    function upsertRecord(record: DeAiBatchTaskRecord, context: ProjectContext): void {
      if (!isProjectContextCurrent(context)) return
      set((state) => {
        if (generation !== context.generation || state.projectPath !== context.projectPath) return state
        const index = state.records.findIndex((item) => item.task.id === record.task.id)
        const records = [...state.records]
        if (index >= 0) records[index] = { task: { ...record.task }, chapters: [...record.chapters] }
        else records.push({ task: { ...record.task }, chapters: [...record.chapters] })
        return { records }
      })
    }

    function chapterActionKey(taskId: string, chapterId: string): string {
      return `${taskId}:${chapterId}`
    }

    function beginChapterAction(taskId: string, chapterId: string): symbol | null {
      const key = chapterActionKey(taskId, chapterId)
      if (taskActions.has(taskId) || chapterActions.has(key)) return null
      const token = Symbol(key)
      chapterActions.set(key, token)
      return token
    }

    function endChapterAction(taskId: string, chapterId: string, token: symbol): void {
      const key = chapterActionKey(taskId, chapterId)
      if (chapterActions.get(key) === token) chapterActions.delete(key)
    }

    function beginTaskAction(taskId: string): symbol | null {
      if (taskActions.has(taskId)) return null
      if (Array.from(chapterActions.keys()).some((key) => key.startsWith(`${taskId}:`))) return null
      const token = Symbol(taskId)
      taskActions.set(taskId, token)
      return token
    }

    function endTaskAction(taskId: string, token: symbol): void {
      if (taskActions.get(taskId) === token) taskActions.delete(taskId)
    }

    function findRecord(taskId: string): DeAiBatchTaskRecord | null {
      return get().records.find((record) => record.task.id === taskId) ?? null
    }

    function getEngine(record: DeAiBatchTaskRecord, context: ProjectContext): DeAiBatchEngine {
      const existing = engines.get(record.task.id)
      if (existing) return existing
      const guardedStorage: DeAiBatchEngineStorage = {
        saveTask: async (task) => {
          if (!isProjectContextCurrent(context)) return
          await storage.saveTask(task)
        },
        saveChapter: async (chapter, projectPath) => {
          if (!isProjectContextCurrent(context)) return
          await storage.saveChapter(chapter, projectPath ?? context.projectPath)
        },
      }
      const engine = createDeAiBatchEngine({
        runner: options.runner,
        storage: guardedStorage,
        now,
        onChange: (changed) => upsertRecord(changed, context),
      })
      engines.set(record.task.id, engine)
      return engine
    }

    function makeScheduler(concurrency: number, context: ProjectContext): DeAiBatchScheduler {
      return createDeAiBatchScheduler({
        concurrency,
        createAgent: (record) => {
          const engine = getEngine(record, context)
          return {
            run: () => engine.runTask(record),
            dispose: () => {
              engine.dispose()
              if (engines.get(record.task.id) === engine) engines.delete(record.task.id)
            },
          }
        },
        onChange: (snapshot) => {
          if (isProjectContextCurrent(context)) set({ scheduler: snapshot })
        },
        onTaskComplete: (record) => upsertRecord(record, context),
        onTaskError: (record, error) => {
          if (!isProjectContextCurrent(context)) return
          const failed: DeAiBatchTaskRecord = {
            ...record,
            task: { ...record.task, status: "failed", error: error.message, updatedAt: now() },
          }
          upsertRecord(failed, context)
          if (isProjectContextCurrent(context)) void storage.saveTask(failed.task)
        },
      })
    }

    async function initializeProject(projectPath: string): Promise<void> {
      const context: ProjectContext = { generation: ++generation, projectPath }
      scheduler?.dispose()
      scheduler = null
      for (const engine of engines.values()) engine.dispose()
      engines.clear()
      chapterActions.clear()
      taskActions.clear()
      set({
        projectPath,
        records: [],
        scheduler: { ...EMPTY_SCHEDULER, concurrency: get().concurrency },
        reviewOpen: false,
        reviewTaskId: null,
        reviewChapterId: null,
      })
      const loaded = await storage.loadProject(projectPath)
      if (!isProjectContextCurrent(context)) return
      for (const record of loaded) {
        const needsModel = record.chapters.some((chapter) =>
          chapter.status === "pending" || chapter.status === "generating" || chapter.status === "failed",
        )
        if (!needsModel || record.task.status === "completed" || record.task.status === "cancelled") continue
        const modelError = validateTaskModel(record.task)
        if (!modelError) continue
        if (!isProjectContextCurrent(context)) return
        record.task = {
          ...record.task,
          status: "failed",
          error: modelError,
          updatedAt: now(),
        }
        await storage.saveTask(record.task)
        if (!isProjectContextCurrent(context)) return
      }
      if (!isProjectContextCurrent(context)) return
      scheduler = makeScheduler(get().concurrency, context)
      set({ records: loaded, scheduler: scheduler.getSnapshot() })
    }

    async function createBatch(inputs: CreateDeAiBatchTaskInput[]): Promise<void> {
      if (inputs.length === 0) return
      const projectPath = get().projectPath
      if (!projectPath) throw new Error("??????")
      if (inputs.some((input) => input.projectPath !== projectPath)) throw new Error("???????????")
      const context = captureProjectContext(projectPath)
      if (!context) return
      if (!scheduler) scheduler = makeScheduler(get().concurrency, context)
      const records: DeAiBatchTaskRecord[] = []
      for (const input of inputs) {
        const record = await storage.createTask(input)
        if (!isProjectContextCurrent(context)) return
        records.push(record)
      }
      if (!isProjectContextCurrent(context)) return
      set((state) => state.projectPath === projectPath ? { records: [...state.records, ...records] } : state)
      scheduler?.enqueue(records)
    }

    async function continueTask(taskId: string): Promise<boolean> {
      const token = beginTaskAction(taskId)
      if (!token) return false
      try {
        const record = findRecord(taskId)
        if (!record || !(["interrupted", "failed", "partial"] as DeAiBatchTask["status"][]).includes(record.task.status)) return false
        const context = captureProjectContext(record.task.projectPath)
        if (!context) return false
        const modelError = validateTaskModel(record.task)
        if (modelError) {
          record.task = { ...record.task, status: "failed", error: modelError, updatedAt: now() }
          if (!isProjectContextCurrent(context)) return false
          await storage.saveTask(record.task)
          if (!isProjectContextCurrent(context)) return false
          upsertRecord(record, context)
          return false
        }
        if (!isProjectContextCurrent(context)) return false
        if (!scheduler) scheduler = makeScheduler(get().concurrency, context)
        scheduler.enqueue(record)
        return true
      } finally {
        endTaskAction(taskId, token)
      }
    }

    async function regenerateChapter(taskId: string, chapterId: string): Promise<boolean> {
      const token = beginChapterAction(taskId, chapterId)
      if (!token) return false
      try {
        const record = findRecord(taskId)
        if (!record) return false
        const context = captureProjectContext(record.task.projectPath)
        if (!context) return false
        const chapter = record.chapters.find((item) => item.id === chapterId)
        if (!chapter || chapter.status === "confirmed" || chapter.status === "generating") return false
        await getEngine(record, context).regenerateChapter(record, chapterId)
        if (!isProjectContextCurrent(context)) return false
        const latest = record.chapters.find((item) => item.id === chapterId)
        if (!latest || latest.status === "confirmed") return false
        record.task = taskAfterChapterChange(record.task, record.chapters, now())
        await storage.saveTask(record.task)
        if (!isProjectContextCurrent(context)) return false
        upsertRecord(record, context)
        return true
      } finally {
        endChapterAction(taskId, chapterId, token)
      }
    }

    async function cancelChapter(taskId: string, chapterId: string): Promise<boolean> {
      const token = beginChapterAction(taskId, chapterId)
      if (!token) return false
      try {
        const record = findRecord(taskId)
        if (!record) return false
        const context = captureProjectContext(record.task.projectPath)
        if (!context) return false
        const current = record.chapters.find((item) => item.id === chapterId)
        if (!current || current.status === "confirmed" || current.status === "cancelled") return false
        const expectedGeneration = current.generation
        await getEngine(record, context).cancelChapter(taskId, chapterId)
        if (!isProjectContextCurrent(context)) return false
        const afterEngine = record.chapters.find((item) => item.id === chapterId)
        if (!afterEngine || afterEngine.status === "confirmed" || afterEngine.generation !== expectedGeneration) return false
        if (afterEngine.status !== "cancelled") {
          const cancelled: DeAiBatchChapter = { ...afterEngine, status: "cancelled", runId: null, error: null, updatedAt: now() }
          record.chapters[record.chapters.findIndex((item) => item.id === chapterId)] = cancelled
          await storage.saveChapter(cancelled, record.task.projectPath)
          if (!isProjectContextCurrent(context)) return false
        }
        record.task = taskAfterChapterChange(record.task, record.chapters, now())
        await storage.saveTask(record.task)
        if (!isProjectContextCurrent(context)) return false
        upsertRecord(record, context)
        return true
      } finally {
        endChapterAction(taskId, chapterId, token)
      }
    }

    async function confirmChapter(
      taskId: string,
      chapterId: string,
      candidateContent?: string,
    ): Promise<boolean> {
      const token = beginChapterAction(taskId, chapterId)
      if (!token) return false
      try {
        const record = findRecord(taskId)
        if (!record) return false
        const context = captureProjectContext(record.task.projectPath)
        if (!context) return false
        const index = record.chapters.findIndex((item) => item.id === chapterId)
        let chapter = record.chapters[index]
        if (!chapter || chapter.status !== "ready") return false
        const expectedCandidate = candidateContent ?? chapter.candidateContent ?? ""
        if (!expectedCandidate.trim()) return false
        const expectedGeneration = chapter.generation
        const safeSourcePath = assertChapterSourcePath(record.task.projectPath, chapter.sourcePath)
        if (candidateContent !== undefined && candidateContent !== chapter.candidateContent) {
          chapter = { ...chapter, candidateContent, updatedAt: now() }
          record.chapters[index] = chapter
          await storage.saveChapter(chapter, record.task.projectPath)
          if (!isProjectContextCurrent(context)) return false
        }
        await applyChapter(safeSourcePath, expectedCandidate)
        if (!isProjectContextCurrent(context)) return false
        const latest = record.chapters.find((item) => item.id === chapterId)
        if (!latest || latest.status !== "ready" || latest.generation !== expectedGeneration || latest.candidateContent !== expectedCandidate) return false
        const confirmed: DeAiBatchChapter = { ...latest, status: "confirmed", error: null, updatedAt: now() }
        record.chapters[index] = confirmed
        record.task = taskAfterChapterChange(record.task, record.chapters, now())
        await storage.saveChapter(confirmed, record.task.projectPath)
        if (!isProjectContextCurrent(context)) return false
        await storage.saveTask(record.task)
        if (!isProjectContextCurrent(context)) return false
        upsertRecord(record, context)
        return true
      } finally {
        endChapterAction(taskId, chapterId, token)
      }
    }

    async function cancelTask(taskId: string): Promise<boolean> {
      const token = beginTaskAction(taskId)
      if (!token) return false
      try {
        const record = findRecord(taskId)
        if (!record || record.task.status === "completed") return false
        const context = captureProjectContext(record.task.projectPath)
        if (!context) return false
        scheduler?.cancel(taskId)
        for (const chapter of record.chapters) {
          if (chapter.status === "confirmed" || chapter.status === "cancelled") continue
          const index = record.chapters.findIndex((item) => item.id === chapter.id)
          const cancelled: DeAiBatchChapter = { ...record.chapters[index], status: "cancelled", runId: null, error: null, updatedAt: now() }
          record.chapters[index] = cancelled
          await storage.saveChapter(cancelled, record.task.projectPath)
          if (!isProjectContextCurrent(context)) return false
        }
        record.task = { ...record.task, status: "cancelled", error: null, completedAt: now(), updatedAt: now() }
        await storage.saveTask(record.task)
        if (!isProjectContextCurrent(context)) return false
        upsertRecord(record, context)
        return true
      } finally {
        endTaskAction(taskId, token)
      }
    }

    return {
      projectPath: null,
      records: [],
      concurrency: options.concurrency ?? 3,
      scheduler: { ...EMPTY_SCHEDULER, concurrency: options.concurrency ?? 3 },
      panelCollapsed: false,
      reviewOpen: false,
      reviewTaskId: null,
      reviewChapterId: null,
      initializeProject,
      createBatch,
      continueTask,
      regenerateChapter,
      cancelChapter,
      confirmChapter,
      cancelTask,
      openReview: (taskId, chapterId) => {
        if (taskActions.has(taskId)) return
        const record = findRecord(taskId)
        if (!record) return
        const targetChapterId = chapterId ?? record.chapters[0]?.id ?? null
        set({ reviewOpen: true, reviewTaskId: taskId, reviewChapterId: targetChapterId })
      },
      closeReview: () => set({ reviewOpen: false }),
      setReviewChapter: (reviewChapterId) => set({ reviewChapterId }),
      setPanelCollapsed: (panelCollapsed) => set({ panelCollapsed }),
      setConcurrency: (value) => {
        scheduler?.setConcurrency(value)
        const concurrency = scheduler?.getSnapshot().concurrency ?? Math.min(5, Math.max(1, Math.floor(value)))
        set({ concurrency, scheduler: scheduler?.getSnapshot() ?? { ...get().scheduler, concurrency } })
      },
      dispose: () => {
        generation += 1
        chapterActions.clear()
        taskActions.clear()
        scheduler?.dispose()
        scheduler = null
        for (const engine of engines.values()) engine.dispose()
        engines.clear()
      },
    }
  })
}

export const useDeAiBatchStore = createDeAiBatchStore({
  runner: createDefaultDeAiBatchLlmRunner(),
})
