import { describe, expect, it, vi } from "vitest"
import {
  clampDeAiBatchConcurrency,
  createDeAiBatchScheduler,
  type DeAiBatchAgent,
} from "./scheduler"
import type { DeAiBatchTaskRecord } from "./types"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function record(id: string): DeAiBatchTaskRecord {
  return {
    task: {
      version: 1,
      id,
      projectPath: "C:/project",
      workId: id,
      workTitle: id,
      modelKey: "openai/test",
      skillId: null,
      skillName: "默认",
      skillContent: "规则",
      status: "queued",
      chapterIds: [],
      error: null,
      createdAt: Number(id.replace(/\D/g, "")) || 1,
      startedAt: null,
      completedAt: null,
      updatedAt: 1,
    },
    chapters: [],
  }
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("de-ai batch scheduler", () => {
  it("默认同时运行 3 个作品 Agent，超限任务严格 FIFO 排队", async () => {
    const gates = new Map<string, ReturnType<typeof deferred<DeAiBatchTaskRecord>>>()
    const started: string[] = []
    const createAgent = vi.fn((item: DeAiBatchTaskRecord): DeAiBatchAgent => {
      const gate = deferred<DeAiBatchTaskRecord>()
      gates.set(item.task.id, gate)
      return {
        run: vi.fn(async () => {
          started.push(item.task.id)
          return gate.promise
        }),
        dispose: vi.fn(),
      }
    })
    const scheduler = createDeAiBatchScheduler({ createAgent })

    scheduler.enqueue([record("task-1"), record("task-2"), record("task-3"), record("task-4"), record("task-5")])
    await flush()

    expect(started).toEqual(["task-1", "task-2", "task-3"])
    expect(scheduler.getSnapshot()).toMatchObject({ activeTaskIds: ["task-1", "task-2", "task-3"], queuedTaskIds: ["task-4", "task-5"] })

    gates.get("task-2")?.resolve(record("task-2"))
    await flush()
    expect(started).toEqual(["task-1", "task-2", "task-3", "task-4"])

    gates.get("task-1")?.resolve(record("task-1"))
    await flush()
    expect(started).toEqual(["task-1", "task-2", "task-3", "task-4", "task-5"])
  })

  it("并发设置限制在 1 到 5，非整数向下取整", () => {
    expect(clampDeAiBatchConcurrency(-1)).toBe(1)
    expect(clampDeAiBatchConcurrency(1)).toBe(1)
    expect(clampDeAiBatchConcurrency(3.9)).toBe(3)
    expect(clampDeAiBatchConcurrency(5)).toBe(5)
    expect(clampDeAiBatchConcurrency(9)).toBe(5)
    expect(clampDeAiBatchConcurrency(Number.NaN)).toBe(3)
  })

  it("一个作品失败不会阻断其他作品并立即释放槽位", async () => {
    const completed: string[] = []
    const failed: string[] = []
    const scheduler = createDeAiBatchScheduler({
      concurrency: 1,
      createAgent: (item) => ({
        run: async () => {
          if (item.task.id === "task-1") throw new Error("作品一失败")
          completed.push(item.task.id)
          return item
        },
        dispose: vi.fn(),
      }),
      onTaskError: (item, error) => failed.push(`${item.task.id}:${error.message}`),
    })

    scheduler.enqueue([record("task-1"), record("task-2")])
    await scheduler.whenIdle()

    expect(failed).toEqual(["task-1:作品一失败"])
    expect(completed).toEqual(["task-2"])
    expect(scheduler.getSnapshot()).toMatchObject({ activeTaskIds: [], queuedTaskIds: [] })
  })

  it("dispose 中止活动 Agent 且不再启动等待任务", async () => {
    const gate = deferred<DeAiBatchTaskRecord>()
    const agents: Array<{ id: string; dispose: ReturnType<typeof vi.fn> }> = []
    const started: string[] = []
    const scheduler = createDeAiBatchScheduler({
      concurrency: 1,
      createAgent: (item) => {
        const dispose = vi.fn()
        agents.push({ id: item.task.id, dispose })
        return {
          run: async () => {
            started.push(item.task.id)
            return gate.promise
          },
          dispose,
        }
      },
    })

    scheduler.enqueue([record("task-1"), record("task-2")])
    await flush()
    scheduler.dispose()
    gate.resolve(record("task-1"))
    await flush()

    expect(agents[0].dispose).toHaveBeenCalledTimes(1)
    expect(started).toEqual(["task-1"])
    expect(scheduler.getSnapshot().disposed).toBe(true)
  })

  it("创建 scheduler 不会自动恢复传入的 interrupted 任务", async () => {
    const createAgent = vi.fn()
    const interrupted = record("task-1")
    interrupted.task.status = "interrupted"

    const scheduler = createDeAiBatchScheduler({ createAgent, initialRecords: [interrupted] })
    await flush()

    expect(createAgent).not.toHaveBeenCalled()
    expect(scheduler.getSnapshot().queuedTaskIds).toEqual([])
  })
  it("取消指定作品会移出 FIFO 队列且不会影响其他作品启动", async () => {
    const first = deferred<DeAiBatchTaskRecord>()
    const started: string[] = []
    const scheduler = createDeAiBatchScheduler({
      concurrency: 1,
      createAgent: (item) => ({
        run: async () => {
          started.push(item.task.id)
          return item.task.id === "task-1" ? first.promise : item
        },
        dispose: vi.fn(),
      }),
    })

    scheduler.enqueue([record("task-1"), record("task-2"), record("task-3")])
    await flush()
    expect(scheduler.cancel("task-2")).toBe(true)
    first.resolve(record("task-1"))
    await scheduler.whenIdle()

    expect(started).toEqual(["task-1", "task-3"])
  })
  it("取消活动作品后只中止并保留槽位，原 run settle 后才启动下一作品", async () => {
    const first = deferred<DeAiBatchTaskRecord>()
    const completed = vi.fn()
    const started: string[] = []
    const scheduler = createDeAiBatchScheduler({
      concurrency: 1,
      onTaskComplete: completed,
      createAgent: (item) => ({
        run: async () => {
          started.push(item.task.id)
          return item.task.id === "task-1" ? first.promise : item
        },
        dispose: vi.fn(),
      }),
    })

    scheduler.enqueue([record("task-1"), record("task-2")])
    await flush()
    expect(scheduler.cancel("task-1")).toBe(true)
    await flush()
    expect(started).toEqual(["task-1"]);
    expect(scheduler.getSnapshot()).toMatchObject({ activeTaskIds: ["task-1"], queuedTaskIds: ["task-2"] });
    first.resolve(record("task-1"))
    await scheduler.whenIdle()
    await flush()

    expect(started).toEqual(["task-1", "task-2"])
    expect(completed).toHaveBeenCalledTimes(1)
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({ task: expect.objectContaining({ id: "task-2" }) }))
  })
})
