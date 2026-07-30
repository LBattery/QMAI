import { describe, expect, it, vi } from "vitest"
import { createDeAiBatchStore } from "./de-ai-batch-store"
import type { DeAiChapterRunner } from "@/lib/novel/de-ai-batch/engine"
import type {
  CreateDeAiBatchTaskInput,
  DeAiBatchChapter,
  DeAiBatchTask,
  DeAiBatchTaskRecord,
} from "@/lib/novel/de-ai-batch/types"

function input(workId: string, chapterIds = ["chapter-1", "chapter-2"]): CreateDeAiBatchTaskInput {
  return {
    projectPath: "C:/project",
    workId,
    workTitle: `作品-${workId}`,
    modelKey: "openai/test",
    skillId: "skill-a",
    skillName: "自然改写",
    skillContent: "规则",
    chapters: chapterIds.map((id, index) => ({
      id,
      title: `第${index + 1}章`,
      order: index + 1,
      sourcePath: `C:/project/wiki/chapters/${workId}/${id}.md`,
      sourceContent: `${workId}-${id}-原文`,
    })),
  }
}

function toRecord(source: CreateDeAiBatchTaskInput, id = `task-${source.workId}`): DeAiBatchTaskRecord {
  const now = 1
  const task: DeAiBatchTask = {
    version: 1,
    id,
    projectPath: source.projectPath,
    workId: source.workId,
    workTitle: source.workTitle,
    modelKey: source.modelKey,
    skillId: source.skillId,
    skillName: source.skillName,
    skillContent: source.skillContent,
    status: "queued",
    chapterIds: source.chapters.map((chapter) => chapter.id),
    error: null,
    createdAt: now,
    startedAt: null,
    completedAt: null,
    updatedAt: now,
  }
  const chapters: DeAiBatchChapter[] = source.chapters.map((chapter) => ({
    version: 1,
    id: chapter.id,
    taskId: id,
    title: chapter.title,
    order: chapter.order,
    sourcePath: chapter.sourcePath,
    sourceContent: chapter.sourceContent,
    candidateContent: null,
    status: "pending",
    runId: null,
    generation: 0,
    error: null,
    createdAt: now,
    updatedAt: now,
  }))
  return { task, chapters }
}

function setup(options: {
  loaded?: DeAiBatchTaskRecord[]
  runner?: DeAiChapterRunner
  validateTaskModel?: (task: DeAiBatchTask) => string | null
} = {}) {
  const records = new Map<string, DeAiBatchTaskRecord>()
  for (const item of options.loaded ?? []) records.set(item.task.id, structuredClone(item))
  const storage = {
    loadProject: vi.fn(async (projectPath: string) => Array.from(records.values())
      .filter((item) => item.task.projectPath === projectPath)
      .map((item) => structuredClone(item))),
    createTask: vi.fn(async (source: CreateDeAiBatchTaskInput) => {
      const item = toRecord(source)
      records.set(item.task.id, structuredClone(item))
      return item
    }),
    saveTask: vi.fn(async (task: DeAiBatchTask) => {
      const current = records.get(task.id)
      if (current) current.task = structuredClone(task)
    }),
    saveChapter: vi.fn(async (chapter: DeAiBatchChapter) => {
      const current = records.get(chapter.taskId)
      if (!current) return
      const index = current.chapters.findIndex((item) => item.id === chapter.id)
      if (index >= 0) current.chapters[index] = structuredClone(chapter)
    }),
  }
  const runner = options.runner ?? vi.fn<DeAiChapterRunner>(async ({ chapter }) => `${chapter.sourceContent}-候选`)
  const applyChapter = vi.fn(async () => undefined)
  const store = createDeAiBatchStore({ storage, runner, applyChapter, validateTaskModel: options.validateTaskModel ?? (() => null), now: (() => {
    let value = 10
    return () => value++
  })() })
  return { store, storage, runner, applyChapter }
}

async function waitFor(assertion: () => void): Promise<void> {
  const started = Date.now()
  while (true) {
    try {
      assertion()
      return
    } catch (error) {
      if (Date.now() - started > 1000) throw error
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
}

describe("de-ai batch store", () => {
  it("初始化只加载并展示 interrupted 任务，不自动继续", async () => {
    const restored = toRecord(input("a"))
    restored.task.status = "interrupted"
    const { store, runner } = setup({ loaded: [restored] })

    await store.getState().initializeProject("C:/project")

    expect(store.getState().records).toHaveLength(1)
    expect(store.getState().records[0].task.status).toBe("interrupted")
    expect(runner).not.toHaveBeenCalled()
  })

  it("新批次按作品创建独立任务并交给 scheduler", async () => {
    const { store, storage, runner } = setup()
    await store.getState().initializeProject("C:/project")

    await store.getState().createBatch([input("a"), input("b")])
    await waitFor(() => {
      expect(store.getState().records.map((item) => item.task.status)).toEqual(["reviewing", "reviewing"])
    })

    expect(storage.createTask).toHaveBeenCalledTimes(2)
    expect(new Set(vi.mocked(runner).mock.calls.map(([call]) => call.task.workId))).toEqual(new Set(["a", "b"]))
  })

  it("继续 interrupted 任务时跳过已生成和已确认章节", async () => {
    const restored = toRecord(input("a", ["chapter-1", "chapter-2", "chapter-3"]))
    restored.task.status = "interrupted"
    restored.chapters[0] = { ...restored.chapters[0], status: "ready", candidateContent: "已有候选" }
    restored.chapters[1] = { ...restored.chapters[1], status: "confirmed", candidateContent: "已确认候选" }
    const { store, runner } = setup({ loaded: [restored] })
    await store.getState().initializeProject("C:/project")

    expect(await store.getState().continueTask(restored.task.id)).toBe(true)
    await waitFor(() => expect(store.getState().records[0].task.status).toBe("reviewing"))

    expect(runner).toHaveBeenCalledTimes(1)
    expect(vi.mocked(runner).mock.calls[0][0].chapter.id).toBe("chapter-3")
  })

  it("completed 任务不允许整批继续", async () => {
    const restored = toRecord(input("a"))
    restored.task.status = "completed"
    restored.chapters = restored.chapters.map((chapter) => ({ ...chapter, status: "confirmed" }))
    const { store, runner } = setup({ loaded: [restored] })
    await store.getState().initializeProject("C:/project")

    expect(await store.getState().continueTask(restored.task.id)).toBe(false)
    expect(runner).not.toHaveBeenCalled()
  })

  it.each(["queued", "running", "reviewing", "cancelled", "completed"] as const)(
    "%s 任务不在继续白名单中",
    async (status) => {
      const restored = toRecord(input("a"))
      restored.task.status = status
      const { store, runner } = setup({ loaded: [restored] })
      await store.getState().initializeProject("C:/project")
      expect(await store.getState().continueTask(restored.task.id)).toBe(false)
      expect(runner).not.toHaveBeenCalled()
    },
  )

  it("同一章节重复确认时只执行一次写回", async () => {
    let release!: () => void
    const applyGate = new Promise<void>((resolve) => { release = resolve })
    const restored = toRecord(input("a"))
    restored.task.status = "reviewing"
    restored.chapters[0] = { ...restored.chapters[0], status: "ready", candidateContent: "候选" }
    const { store, applyChapter } = setup({ loaded: [restored] })
    vi.mocked(applyChapter).mockImplementationOnce(async () => applyGate)
    await store.getState().initializeProject("C:/project")
    const first = store.getState().confirmChapter(restored.task.id, "chapter-1")
    const second = store.getState().confirmChapter(restored.task.id, "chapter-1")
    expect(await second).toBe(false)
    expect(applyChapter).toHaveBeenCalledTimes(1)
    release()
    expect(await first).toBe(true)
    expect(store.getState().records[0].chapters[0].status).toBe("confirmed")
  })

  it("同一章节重新生成期间拒绝取消", async () => {
    let release!: (value: string) => void
    const gate = new Promise<string>((resolve) => { release = resolve })
    const restored = toRecord(input("a"))
    restored.task.status = "reviewing"
    restored.chapters[0] = { ...restored.chapters[0], status: "ready", candidateContent: "旧候选" }
    const runner = vi.fn<DeAiChapterRunner>(async () => gate)
    const { store } = setup({ loaded: [restored], runner })
    await store.getState().initializeProject("C:/project")
    const regenerating = store.getState().regenerateChapter(restored.task.id, "chapter-1")
    expect(await store.getState().cancelChapter(restored.task.id, "chapter-1")).toBe(false)
    release("新候选")
    expect(await regenerating).toBe(true)
    expect(store.getState().records[0].chapters[0]).toMatchObject({ status: "ready", candidateContent: "新候选" })
  })

  it("最终确认写回前再次拒绝被篡改到项目外的 sourcePath", async () => {
    const restored = toRecord(input("a"))
    restored.task.status = "reviewing"
    restored.chapters[0] = { ...restored.chapters[0], status: "ready", candidateContent: "候选", sourcePath: "C:/project/wiki/chapters/../../项目外.md" }
    const { store, applyChapter } = setup({ loaded: [restored] })
    await store.getState().initializeProject("C:/project")
    await expect(store.getState().confirmChapter(restored.task.id, "chapter-1"))
      .rejects.toThrow("章节源文件不属于当前项目章节目录")
    expect(applyChapter).not.toHaveBeenCalled()
  })
  it("支持指定章重新生成、取消当前章和打开审核", async () => {
    const restored = toRecord(input("a"))
    restored.task.status = "reviewing"
    restored.chapters[0] = { ...restored.chapters[0], status: "ready", candidateContent: "旧候选" }
    const { store, runner } = setup({ loaded: [restored] })
    await store.getState().initializeProject("C:/project")

    store.getState().openReview(restored.task.id, "chapter-1")
    expect(store.getState()).toMatchObject({ reviewOpen: true, reviewTaskId: restored.task.id, reviewChapterId: "chapter-1" })

    await store.getState().regenerateChapter(restored.task.id, "chapter-1")
    expect(store.getState().records[0].chapters[0].candidateContent).toContain("候选")
    expect(runner).toHaveBeenCalledTimes(1)

    await store.getState().cancelChapter(restored.task.id, "chapter-2")
    expect(store.getState().records[0].chapters[1].status).toBe("cancelled")
  })

  it("确认只覆盖当前章并持久化确认状态", async () => {
    const restored = toRecord(input("a"))
    restored.task.status = "reviewing"
    restored.chapters = restored.chapters.map((chapter, index) => ({
      ...chapter,
      status: "ready",
      candidateContent: `候选-${index + 1}`,
    }))
    const { store, applyChapter, storage } = setup({ loaded: [restored] })
    await store.getState().initializeProject("C:/project")

    expect(await store.getState().confirmChapter(restored.task.id, "chapter-1")).toBe(true)

    expect(applyChapter).toHaveBeenCalledTimes(1)
    expect(applyChapter).toHaveBeenCalledWith("C:/project/wiki/chapters/a/chapter-1.md", "候选-1")
    expect(store.getState().records[0].chapters.map((chapter) => chapter.status)).toEqual(["confirmed", "ready"])
    expect(storage.saveChapter).toHaveBeenCalledWith(expect.objectContaining({ id: "chapter-1", status: "confirmed" }), "C:/project")
  })

  it("confirms and persists the user-edited candidate content", async () => {
    const restored = toRecord(input("a"))
    restored.task.status = "reviewing"
    restored.chapters[0] = {
      ...restored.chapters[0],
      status: "ready",
      candidateContent: "model candidate",
    }
    const { store, applyChapter, storage } = setup({ loaded: [restored] })
    await store.getState().initializeProject("C:/project")

    expect(await store.getState().confirmChapter(
      restored.task.id,
      "chapter-1",
      "user-edited candidate",
    )).toBe(true)

    expect(applyChapter).toHaveBeenCalledWith(
      "C:/project/wiki/chapters/a/chapter-1.md",
      "user-edited candidate",
    )
    expect(store.getState().records[0].chapters[0]).toMatchObject({
      status: "confirmed",
      candidateContent: "user-edited candidate",
    })
    expect(storage.saveChapter).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "chapter-1",
        status: "confirmed",
        candidateContent: "user-edited candidate",
      }),
      "C:/project",
    )
  })

  it("取消批次只停止该作品，其他作品继续", async () => {
    const { store } = setup()
    await store.getState().initializeProject("C:/project")
    await store.getState().createBatch([input("a"), input("b")])
    await store.getState().cancelTask("task-a")

    expect(store.getState().records.find((item) => item.task.id === "task-a")?.task.status).toBe("cancelled")
    expect(store.getState().records.find((item) => item.task.id === "task-b")?.task.status).not.toBe("cancelled")
  })

  it("恢复初始化前校验任务绑定模型，缺失时中文失败且不自动换模型", async () => {
    const restored = toRecord(input("a"))
    restored.task.status = "interrupted"
    const error = "任务绑定模型“custom-a/removed”已不可用，请重新配置该模型后再继续"
    const { store, storage, runner } = setup({
      loaded: [restored],
      validateTaskModel: () => error,
    })

    await store.getState().initializeProject("C:/project")

    expect(store.getState().records[0].task).toMatchObject({ status: "failed", error })
    expect(storage.saveTask).toHaveBeenCalledWith(expect.objectContaining({ id: restored.task.id, status: "failed", error }))
    expect(runner).not.toHaveBeenCalled()
  })

  it("setConcurrency 立即更新当前 scheduler 而不重建项目", async () => {
    const { store } = setup()
    await store.getState().initializeProject("C:/project")

    store.getState().setConcurrency(5)

    expect(store.getState().concurrency).toBe(5)
    expect(store.getState().scheduler.concurrency).toBe(5)
  })

  it("确认等待期间切换项目后旧操作失效且不会插入旧 record", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const restored = toRecord(input("a"))
    restored.task.status = "reviewing"
    restored.chapters[0] = { ...restored.chapters[0], status: "ready", candidateContent: "候选" }
    const { store, applyChapter, storage } = setup({ loaded: [restored] })
    vi.mocked(applyChapter).mockImplementationOnce(async () => gate)
    await store.getState().initializeProject("C:/project")

    const confirming = store.getState().confirmChapter(restored.task.id, "chapter-1")
    await store.getState().initializeProject("C:/other")
    release()

    expect(await confirming).toBe(false)
    expect(store.getState()).toMatchObject({ projectPath: "C:/other", records: [] })
    expect(storage.saveChapter).not.toHaveBeenCalledWith(expect.objectContaining({ status: "confirmed" }), expect.anything())
  })

  it("重新生成等待期间 dispose 后旧结果不会重新插入 record", async () => {
    let release!: (value: string) => void
    const gate = new Promise<string>((resolve) => { release = resolve })
    const restored = toRecord(input("a"))
    restored.task.status = "reviewing"
    restored.chapters[0] = { ...restored.chapters[0], status: "ready", candidateContent: "旧候选" }
    const { store } = setup({ loaded: [restored], runner: vi.fn(async () => gate) })
    await store.getState().initializeProject("C:/project")

    const regenerating = store.getState().regenerateChapter(restored.task.id, "chapter-1")
    store.getState().dispose()
    await store.getState().initializeProject("C:/other")
    release("迟到候选")

    expect(await regenerating).toBe(false)
    expect(store.getState()).toMatchObject({ projectPath: "C:/other", records: [] })
  })

  it("章节取消等待期间切换项目后不会把旧 record 插入新项目", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const restored = toRecord(input("a"))
    restored.task.status = "reviewing"
    const { store, storage } = setup({ loaded: [restored] })
    vi.mocked(storage.saveChapter).mockImplementationOnce(async () => gate)
    await store.getState().initializeProject("C:/project")

    const cancelling = store.getState().cancelChapter(restored.task.id, "chapter-1")
    await waitFor(() => expect(storage.saveChapter).toHaveBeenCalled())
    await store.getState().initializeProject("C:/other")
    release()

    expect(await cancelling).toBe(false)
    expect(store.getState()).toMatchObject({ projectPath: "C:/other", records: [] })
  })
  it("章节确认进行中拒绝整批取消，保持磁盘与状态一致", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const restored = toRecord(input("a"))
    restored.task.status = "reviewing"
    restored.chapters[0] = { ...restored.chapters[0], status: "ready", candidateContent: "候选" }
    const { store, applyChapter } = setup({ loaded: [restored] })
    vi.mocked(applyChapter).mockImplementationOnce(async () => gate)
    await store.getState().initializeProject("C:/project")

    const confirming = store.getState().confirmChapter(restored.task.id, "chapter-1")
    expect(await store.getState().cancelTask(restored.task.id)).toBe(false)
    release()
    expect(await confirming).toBe(true)
    expect(store.getState().records[0]).toMatchObject({
      task: { status: "reviewing" },
      chapters: [expect.objectContaining({ id: "chapter-1", status: "confirmed" }), expect.anything()],
    })
  })

  it("整批取消持有任务锁期间拒绝章节确认", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const restored = toRecord(input("a"))
    restored.task.status = "reviewing"
    restored.chapters[0] = { ...restored.chapters[0], status: "ready", candidateContent: "候选" }
    const { store, storage, applyChapter } = setup({ loaded: [restored] })
    vi.mocked(storage.saveChapter).mockImplementationOnce(async () => gate)
    await store.getState().initializeProject("C:/project")

    const cancelling = store.getState().cancelTask(restored.task.id)
    await waitFor(() => expect(storage.saveChapter).toHaveBeenCalled())
    expect(await store.getState().confirmChapter(restored.task.id, "chapter-1")).toBe(false)
    expect(applyChapter).not.toHaveBeenCalled()
    release()
    expect(await cancelling).toBe(true)
    expect(store.getState().records[0].task.status).toBe("cancelled")
  })})
