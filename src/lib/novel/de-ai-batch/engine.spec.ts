import { describe, expect, it, vi } from "vitest"
import { createDeAiBatchEngine, type DeAiChapterRunner } from "./engine"
import type { DeAiBatchChapter, DeAiBatchTask, DeAiBatchTaskRecord } from "./types"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function record(): DeAiBatchTaskRecord {
  const task: DeAiBatchTask = {
    version: 1,
    id: "task-a",
    projectPath: "C:/project",
    workId: "work-a",
    workTitle: "作品甲",
    modelKey: "openai/test",
    skillId: "skill-a",
    skillName: "自然改写",
    skillContent: "规则",
    status: "queued",
    chapterIds: ["chapter-1", "chapter-2"],
    error: null,
    createdAt: 1,
    startedAt: null,
    completedAt: null,
    updatedAt: 1,
  }
  const chapter = (id: string, order: number): DeAiBatchChapter => ({
    version: 1,
    id,
    taskId: task.id,
    title: `第${order}章`,
    order,
    sourcePath: `C:/project/chapters/${id}.md`,
    sourceContent: `${id}原文`,
    candidateContent: null,
    status: "pending",
    runId: null,
    generation: 0,
    error: null,
    createdAt: 1,
    updatedAt: 1,
  })
  return { task, chapters: [chapter("chapter-1", 1), chapter("chapter-2", 2)] }
}

function setup(runner: DeAiChapterRunner, now = (() => {
  let value = 10
  return () => value++
})()) {
  const storage = {
    saveTask: vi.fn(async () => undefined),
    saveChapter: vi.fn(async () => undefined),
  }
  const engine = createDeAiBatchEngine({ runner, storage, now, id: (() => {
    let value = 0
    return () => `run-${++value}`
  })() })
  return { engine, storage }
}

describe("de-ai batch engine", () => {
  it("按章节独立调用模型并在每章完成后持久化候选", async () => {
    const calls: string[] = []
    const runner = vi.fn<DeAiChapterRunner>(async ({ task, chapter }) => {
      calls.push(`${task.workId}:${chapter.id}`)
      return `${chapter.sourceContent}-候选`
    })
    const { engine, storage } = setup(runner)

    const result = await engine.runTask(record())

    expect(calls).toEqual(["work-a:chapter-1", "work-a:chapter-2"])
    expect(result.chapters.map((chapter) => [chapter.status, chapter.candidateContent])).toEqual([
      ["ready", "chapter-1原文-候选"],
      ["ready", "chapter-2原文-候选"],
    ])
    expect(result.task.status).toBe("reviewing")
    expect(storage.saveChapter).toHaveBeenCalled()
    expect(storage.saveTask).toHaveBeenLastCalledWith(expect.objectContaining({ status: "reviewing" }))
  })

  it("单章失败写入检查点但继续处理后续章节", async () => {
    const runner = vi.fn<DeAiChapterRunner>(async ({ chapter }) => {
      if (chapter.id === "chapter-1") throw new Error("模型暂时不可用")
      return "第二章候选"
    })
    const { engine } = setup(runner)

    const result = await engine.runTask(record())

    expect(result.chapters[0]).toMatchObject({
      status: "failed",
      candidateContent: null,
      error: "模型暂时不可用",
    })
    expect(result.chapters[1]).toMatchObject({ status: "ready", candidateContent: "第二章候选" })
    expect(result.task.status).toBe("partial")
    expect(runner).toHaveBeenCalledTimes(2)
  })

  it("取消只中止当前章节并将该章标记为 cancelled", async () => {
    const started = deferred<void>()
    const runner = vi.fn<DeAiChapterRunner>(async ({ signal }) => {
      started.resolve()
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })
      })
      return "不会产生"
    })
    const { engine } = setup(runner)
    const source = record()

    const running = engine.runChapter(source, "chapter-1")
    await started.promise
    await engine.cancelChapter("task-a", "chapter-1")
    const result = await running

    expect(result).toMatchObject({ status: "cancelled", candidateContent: null, runId: null })
    expect(source.chapters[1].status).toBe("pending")
  })

  it("重新生成失败时保留旧候选，成功前也不清空旧候选", async () => {
    const pending = deferred<string>()
    const runner = vi.fn<DeAiChapterRunner>(() => pending.promise)
    const { engine } = setup(runner)
    const source = record()
    source.chapters[0] = { ...source.chapters[0], status: "ready", candidateContent: "旧候选" }

    const running = engine.regenerateChapter(source, "chapter-1")
    expect(source.chapters[0].candidateContent).toBe("旧候选")
    pending.reject(new Error("重新生成失败"))
    const result = await running

    expect(result).toMatchObject({
      status: "failed",
      candidateContent: "旧候选",
      error: "重新生成失败",
    })
  })

  it("较早请求后返回时不会覆盖较新的重新生成结果", async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const runner = vi.fn<DeAiChapterRunner>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const { engine } = setup(runner)
    const source = record()
    source.chapters[0] = { ...source.chapters[0], status: "ready", candidateContent: "旧候选" }

    const earlier = engine.regenerateChapter(source, "chapter-1")
    const later = engine.regenerateChapter(source, "chapter-1")
    second.resolve("新候选")
    await later
    first.resolve("陈旧候选")
    await earlier

    expect(source.chapters[0]).toMatchObject({ status: "ready", candidateContent: "新候选", runId: null })
  })
  it("dispose 中止当前章后不再启动后续章节", async () => {
    const started = deferred<void>()
    const runner = vi.fn<DeAiChapterRunner>(async ({ signal }) => {
      started.resolve()
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })
      })
      return "不会产生"
    })
    const { engine } = setup(runner)
    const source = record()

    const running = engine.runTask(source)
    await started.promise
    engine.dispose()
    await running

    expect(runner).toHaveBeenCalledTimes(1)
    expect(source.chapters[1].status).toBe("pending")
  })
})
