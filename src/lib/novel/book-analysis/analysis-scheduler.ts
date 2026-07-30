import type { LlmConfig } from "@/stores/wiki-store"
import {
  loadAnalysisChunkResult,
  saveAnalysisChunk,
  saveAnalysisTask,
  saveCompletedChunk,
} from "./analysis-pipeline-storage"
import {
  ANALYSIS_SKILL_ORDER,
  normalizeSelectedSkills,
  type AnalysisChunkRecord,
  type AnalysisEvidenceSnippet,
  type AnalysisModuleState,
  type AnalysisSkill,
  type BookAnalysisPipelineTask,
} from "./analysis-pipeline-types"
import type {
  AnalysisChunkOutput,
  AnalysisSkillAdapter,
  AnalysisSkillContext,
} from "./analysis-skill-adapter"

export interface AnalysisSchedulerSnapshot {
  tasks: BookAnalysisPipelineTask[]
  chunks: AnalysisChunkRecord[]
}

export interface AnalysisScheduler {
  initialize(tasks: BookAnalysisPipelineTask[], chunks: AnalysisChunkRecord[]): void
  enqueue(task: BookAnalysisPipelineTask, chunks: AnalysisChunkRecord[]): Promise<void>
  pauseTask(taskId: string): Promise<void>
  continueTask(taskId: string): Promise<void>
  retryFailedChunk(taskId: string, skill: AnalysisSkill, chunkId: string): Promise<void>
  cancelTask(taskId: string): Promise<void>
  getSnapshot(): AnalysisSchedulerSnapshot
  subscribe(listener: (snapshot: AnalysisSchedulerSnapshot) => void): () => void
  whenIdle(): Promise<void>
  dispose(): Promise<void>
}

interface AnalysisSchedulerOptions {
  adapters: Record<AnalysisSkill, AnalysisSkillAdapter>
  llmConfig: LlmConfig | (() => LlmConfig)
  concurrency?: number
  saveTask?: typeof saveAnalysisTask
  saveChunk?: typeof saveAnalysisChunk
  saveCompletedChunk?: typeof saveCompletedChunk
  loadChunkResult?: typeof loadAnalysisChunkResult
  now?: () => number
}

function chunkKey(chunk: Pick<AnalysisChunkRecord, "taskId" | "skill" | "id">): string {
  return `${chunk.taskId}:${chunk.skill}:${chunk.id}`
}

function copyTask(task: BookAnalysisPipelineTask): BookAnalysisPipelineTask {
  return {
    ...task,
    selectedSkills: [...task.selectedSkills],
    range: task.range ? { ...task.range } : null,
    modules: Object.fromEntries(ANALYSIS_SKILL_ORDER.map((skill) => [skill, {
      ...task.modules[skill],
      range: { ...task.modules[skill].range },
      chunkIds: [...task.modules[skill].chunkIds],
      completedChunkIds: [...task.modules[skill].completedChunkIds],
    }])) as BookAnalysisPipelineTask["modules"],
  }
}

function copyChunk(chunk: AnalysisChunkRecord): AnalysisChunkRecord {
  return { ...chunk, chapterIds: [...chunk.chapterIds] }
}

export function createAnalysisScheduler(options: AnalysisSchedulerOptions): AnalysisScheduler {
  const concurrency = Math.max(1, Math.min(2, Math.floor(options.concurrency ?? 2)))
  const persistTask = options.saveTask ?? saveAnalysisTask
  const persistChunk = options.saveChunk ?? saveAnalysisChunk
  const persistCompletedChunk = options.saveCompletedChunk ?? saveCompletedChunk
  const readChunkResult = options.loadChunkResult ?? loadAnalysisChunkResult
  const now = options.now ?? Date.now
  const tasks = new Map<string, BookAnalysisPipelineTask>()
  const chunks = new Map<string, AnalysisChunkRecord>()
  const taskRuns = new Map<string, Promise<void>>()
  const chunkRuns = new Map<string, Promise<void>>()
  const controllers = new Map<string, AbortController>()
  const pauseRequested = new Set<string>()
  const cancelRequested = new Set<string>()
  const listeners = new Set<(snapshot: AnalysisSchedulerSnapshot) => void>()
  let disposed = false
  let activeChunks = 0
  const permitWaiters: Array<() => void> = []

  function snapshot(): AnalysisSchedulerSnapshot {
    return {
      tasks: [...tasks.values()].map(copyTask),
      chunks: [...chunks.values()].map(copyChunk),
    }
  }

  function notify(): void {
    if (disposed) return
    const value = snapshot()
    for (const listener of listeners) listener(value)
  }

  function resolveLlmConfig(): LlmConfig {
    return typeof options.llmConfig === "function" ? options.llmConfig() : options.llmConfig
  }

  async function acquirePermit(): Promise<void> {
    if (activeChunks < concurrency) {
      activeChunks += 1
      return
    }
    await new Promise<void>((resolve) => permitWaiters.push(resolve))
    activeChunks += 1
  }

  function releasePermit(): void {
    activeChunks = Math.max(0, activeChunks - 1)
    permitWaiters.shift()?.()
  }

  async function updateTask(task: BookAnalysisPipelineTask): Promise<void> {
    tasks.set(task.id, task)
    await persistTask(task)
    notify()
  }

  function contextFor(task: BookAnalysisPipelineTask, skill: AnalysisSkill): AnalysisSkillContext {
    return {
      task: copyTask(task),
      skill,
      bookPath: task.bookPath,
      projectPath: task.projectPath,
      llmConfig: resolveLlmConfig(),
    }
  }

  async function runChunk(task: BookAnalysisPipelineTask, skill: AnalysisSkill, chunk: AnalysisChunkRecord): Promise<void> {
    const key = chunkKey(chunk)
    const existing = chunkRuns.get(key)
    if (existing) return existing

    const operation = (async () => {
      await acquirePermit()
      if (disposed || pauseRequested.has(task.id) || cancelRequested.has(task.id)) {
        releasePermit()
        return
      }
      const controller = new AbortController()
      controllers.set(key, controller)
      const startedAt = now()
      const running: AnalysisChunkRecord = {
        ...chunk,
        status: "running",
        attempts: chunk.attempts + 1,
        error: null,
        startedAt,
        completedAt: null,
        updatedAt: startedAt,
      }
      chunks.set(key, running)
      await persistChunk(task.bookPath, running)
      notify()

      try {
        const output = await options.adapters[skill].runChunk({
          ...contextFor(task, skill),
          chunk: copyChunk(running),
          signal: controller.signal,
        })
        if (controller.signal.aborted) throw new Error("分析任务已取消")
        const completed = await persistCompletedChunk(task.bookPath, running, output)
        chunks.set(key, completed)
        notify()
      } catch (error) {
        const failedAt = now()
        const aborted = controller.signal.aborted || cancelRequested.has(task.id)
        const failed: AnalysisChunkRecord = {
          ...running,
          status: aborted ? "cancelled" : "failed",
          error: aborted ? "用户取消分析" : (error instanceof Error ? error.message : "章节区块分析失败"),
          completedAt: null,
          updatedAt: failedAt,
        }
        chunks.set(key, failed)
        await persistChunk(task.bookPath, failed)
        notify()
        throw error
      } finally {
        controllers.delete(key)
        releasePermit()
      }
    })().finally(() => chunkRuns.delete(key))
    chunkRuns.set(key, operation)
    return operation
  }

  function chunksFor(taskId: string, skill: AnalysisSkill): AnalysisChunkRecord[] {
    return [...chunks.values()]
      .filter((chunk) => chunk.taskId === taskId && chunk.skill === skill)
      .sort((left, right) => left.startOrder - right.startOrder)
  }

  async function markTaskStopped(task: BookAnalysisPipelineTask, status: "paused" | "cancelled"): Promise<void> {
    const stoppedAt = now()
    await updateTask({
      ...task,
      status,
      error: status === "cancelled" ? "用户取消分析" : null,
      currentSkill: status === "cancelled" ? null : task.currentSkill,
      completedAt: status === "cancelled" ? stoppedAt : null,
      updatedAt: stoppedAt,
    })
  }

  async function runTaskInternal(taskId: string): Promise<void> {
    let task = tasks.get(taskId)
    if (!task || disposed) return
    const startedAt = task.startedAt ?? now()
    task = {
      ...task,
      selectedSkills: normalizeSelectedSkills(task.selectedSkills),
      status: "running",
      error: null,
      startedAt,
      completedAt: null,
      updatedAt: now(),
    }
    await updateTask(task)

    try {
      for (const skill of task.selectedSkills) {
        task = tasks.get(taskId) ?? task
        if (cancelRequested.has(taskId)) {
          await markTaskStopped(task, "cancelled")
          return
        }
        if (pauseRequested.has(taskId)) {
          await markTaskStopped(task, "paused")
          return
        }
        if (task.modules[skill].status === "completed") continue

        const runningModule: AnalysisModuleState = {
          ...task.modules[skill],
          status: "running" as const,
          failedChunkId: null,
          updatedAt: now(),
        }
        task = {
          ...task,
          currentSkill: skill,
          modules: { ...task.modules, [skill]: runningModule },
          updatedAt: now(),
        }
        await updateTask(task)

        while (true) {
          if (cancelRequested.has(taskId)) {
            await markTaskStopped(tasks.get(taskId) ?? task, "cancelled")
            return
          }
          if (pauseRequested.has(taskId)) {
            await markTaskStopped(tasks.get(taskId) ?? task, "paused")
            return
          }
          const pending = chunksFor(taskId, skill)
            .filter((chunk) => chunk.status === "pending" || chunk.status === "failed")
            .slice(0, concurrency)
          if (pending.length === 0) break
          const settled = await Promise.allSettled(pending.map((chunk) => runChunk(task!, skill, chunk)))
          const rejected = settled.find((result): result is PromiseRejectedResult => result.status === "rejected")
          if (rejected) throw rejected.reason
        }

        const completedChunks = chunksFor(taskId, skill).filter((chunk) => chunk.status === "completed")
        const expectedIds = new Set(task.modules[skill].chunkIds)
        if (completedChunks.length !== expectedIds.size || completedChunks.some((chunk) => !expectedIds.has(chunk.id))) {
          throw new Error("章节区块尚未全部完成，无法汇总")
        }

        const outputs: AnalysisChunkOutput[] = []
        for (const chunk of completedChunks) {
          const output = await readChunkResult<AnalysisChunkOutput>(chunk)
          if (!output) throw new Error(`第 ${chunk.startOrder}～${chunk.endOrder} 章结果缺失，无法汇总`)
          outputs.push(output)
        }
        const aggregateController = new AbortController()
        const aggregateKey = `${taskId}:${skill}:aggregate`
        controllers.set(aggregateKey, aggregateController)
        let result: unknown
        try {
          result = await options.adapters[skill].aggregate({
            ...contextFor(task, skill),
            chunks: outputs.map((output) => output.result),
            signal: aggregateController.signal,
          })
        } finally {
          controllers.delete(aggregateKey)
        }
        const evidence: AnalysisEvidenceSnippet[] = outputs.flatMap((output) => output.evidence)
        const publishController = new AbortController()
        const publishKey = `${taskId}:${skill}:publish`
        controllers.set(publishKey, publishController)
        let resultPath: string
        try {
          resultPath = await options.adapters[skill].publish({
            ...contextFor(task, skill),
            result,
            evidence,
            signal: publishController.signal,
          })
        } finally {
          controllers.delete(publishKey)
        }

        task = tasks.get(taskId) ?? task
        const completedAt = now()
        task = {
          ...task,
          modules: {
            ...task.modules,
            [skill]: {
              ...task.modules[skill],
              status: "completed",
              completedChunkIds: completedChunks.map((chunk) => chunk.id),
              failedChunkId: null,
              resultPath,
              updatedAt: completedAt,
            },
          },
          updatedAt: completedAt,
        }
        await updateTask(task)
      }

      const completedAt = now()
      await updateTask({
        ...(tasks.get(taskId) ?? task),
        status: "completed",
        currentSkill: null,
        error: null,
        completedAt,
        updatedAt: completedAt,
      })
    } catch (error) {
      task = tasks.get(taskId) ?? task
      if (cancelRequested.has(taskId)) {
        await markTaskStopped(task, "cancelled")
        return
      }
      if (pauseRequested.has(taskId)) {
        await markTaskStopped(task, "paused")
        return
      }
      const failedSkill = task.currentSkill
      const failedAt = now()
      await updateTask({
        ...task,
        status: "failed",
        error: error instanceof Error ? error.message : "分析任务失败",
        modules: failedSkill ? {
          ...task.modules,
          [failedSkill]: {
            ...task.modules[failedSkill],
            status: "failed",
            failedChunkId: chunksFor(taskId, failedSkill).find((chunk) => chunk.status === "failed")?.id ?? null,
            updatedAt: failedAt,
          },
        } : task.modules,
        updatedAt: failedAt,
      })
    }
  }

  function runTask(taskId: string): Promise<void> {
    if (disposed) return Promise.resolve()
    const existing = taskRuns.get(taskId)
    if (existing) return existing
    const operation = runTaskInternal(taskId).finally(() => {
      taskRuns.delete(taskId)
      pauseRequested.delete(taskId)
      cancelRequested.delete(taskId)
    })
    taskRuns.set(taskId, operation)
    return operation
  }

  return {
    initialize(nextTasks, nextChunks) {
      tasks.clear()
      chunks.clear()
      for (const task of nextTasks) tasks.set(task.id, copyTask(task))
      for (const chunk of nextChunks) chunks.set(chunkKey(chunk), copyChunk(chunk))
      notify()
    },
    async enqueue(task, nextChunks) {
      tasks.set(task.id, copyTask(task))
      for (const chunk of nextChunks) chunks.set(chunkKey(chunk), copyChunk(chunk))
      notify()
      await runTask(task.id)
    },
    async pauseTask(taskId) {
      const task = tasks.get(taskId)
      if (!task || task.status === "completed" || task.status === "cancelled") return
      pauseRequested.add(taskId)
      const running = taskRuns.get(taskId)
      if (running) await running
      else await markTaskStopped(task, "paused")
    },
    async continueTask(taskId) {
      const task = tasks.get(taskId)
      if (!task || task.status === "completed") return
      pauseRequested.delete(taskId)
      cancelRequested.delete(taskId)
      await runTask(taskId)
    },
    async retryFailedChunk(taskId, skill, chunkId) {
      const task = tasks.get(taskId)
      if (!task) throw new Error("未找到分析任务")
      const key = `${taskId}:${skill}:${chunkId}`
      const chunk = chunks.get(key)
      if (!chunk || (chunk.status !== "failed" && chunk.status !== "cancelled")) {
        throw new Error("未找到可重试的失败区块")
      }
      const reset = { ...chunk, status: "pending" as const, error: null, startedAt: null, completedAt: null, updatedAt: now() }
      chunks.set(key, reset)
      await persistChunk(task.bookPath, reset)
      await runTask(taskId)
    },
    async cancelTask(taskId) {
      const task = tasks.get(taskId)
      if (!task || task.status === "completed" || task.status === "cancelled") return
      cancelRequested.add(taskId)
      for (const [key, controller] of controllers) {
        if (key.startsWith(`${taskId}:`)) controller.abort()
      }
      const running = taskRuns.get(taskId)
      if (running) await running
      else await markTaskStopped(task, "cancelled")
    },
    getSnapshot: snapshot,
    subscribe(listener) {
      listeners.add(listener)
      listener(snapshot())
      return () => listeners.delete(listener)
    },
    async whenIdle() {
      while (taskRuns.size > 0) await Promise.allSettled([...taskRuns.values()])
    },
    async dispose() {
      disposed = true
      for (const controller of controllers.values()) controller.abort()
      await Promise.allSettled([...taskRuns.values()])
      listeners.clear()
      permitWaiters.splice(0).forEach((resolve) => resolve())
    },
  }
}
