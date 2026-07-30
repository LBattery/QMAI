import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createDeAiBatchStorage,
  type DeAiBatchStorageIo,
} from "./storage"
import type { CreateDeAiBatchTaskInput, DeAiBatchChapter, DeAiBatchTask } from "./types"

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/g, "")
}

function createMemoryIo() {
  const files = new Map<string, string>()
  const directories = new Set<string>()
  const atomicWrites: string[] = []
  const io: DeAiBatchStorageIo = {
    createDirectory: vi.fn(async (path) => {
      directories.add(normalize(path))
    }),
    writeFileAtomic: vi.fn(async (path, content) => {
      const key = normalize(path)
      files.set(key, content)
      atomicWrites.push(key)
    }),
    readFile: vi.fn(async (path) => {
      const key = normalize(path)
      const value = files.get(key)
      if (value === undefined) throw new Error(`missing: ${key}`)
      return value
    }),
    listDirectory: vi.fn(async (path) => {
      const root = `${normalize(path)}/`
      const names = new Set<string>()
      for (const entry of [...files.keys(), ...directories]) {
        if (!entry.startsWith(root)) continue
        const name = entry.slice(root.length).split("/")[0]
        if (name) names.add(name)
      }
      return Array.from(names).map((name) => ({ name, path: `${root}${name}` }))
    }),
  }
  return { io, files, atomicWrites }
}

function taskInput(overrides: Partial<CreateDeAiBatchTaskInput> = {}): CreateDeAiBatchTaskInput {
  return {
    projectPath: "C:/作品库/甲",
    workId: "work-a",
    workTitle: "作品甲",
    modelKey: "openai/gpt-test",
    skillId: "built-in:comprehensive",
    skillName: "综合去 AI 味",
    skillContent: "保留剧情并自然改写",
    chapters: [
      {
        id: "chapter-1",
        title: "第一章",
        order: 1,
        sourcePath: "C:/作品库/甲/wiki/chapters/第一章.md",
        sourceContent: "第一章原文",
      },
      {
        id: "chapter-2",
        title: "第二章",
        order: 2,
        sourcePath: "C:/作品库/甲/wiki/chapters/第二章.md",
        sourceContent: "第二章原文",
      },
    ],
    ...overrides,
  }
}

function runningTask(task: DeAiBatchTask): DeAiBatchTask {
  return { ...task, status: "running", startedAt: 20, updatedAt: 20 }
}

function generatingChapter(chapter: DeAiBatchChapter): DeAiBatchChapter {
  return {
    ...chapter,
    status: "generating",
    runId: "run-before-close",
    updatedAt: 20,
  }
}

describe("de-ai batch storage", () => {
  let memory: ReturnType<typeof createMemoryIo>

  beforeEach(() => {
    memory = createMemoryIo()
  })

  it("原子持久化作品任务、章节检查点和不可变原文副本", async () => {
    const storage = createDeAiBatchStorage(memory.io, { now: () => 10, id: () => "task-a" })

    const created = await storage.createTask(taskInput())
    const loaded = await storage.loadTask("C:/作品库/甲", "task-a")

    expect(created.task).toMatchObject({
      id: "task-a",
      workId: "work-a",
      workTitle: "作品甲",
      status: "queued",
      chapterIds: ["chapter-1", "chapter-2"],
    })
    expect(loaded?.chapters.map((chapter) => ({
      id: chapter.id,
      status: chapter.status,
      sourceContent: chapter.sourceContent,
      candidateContent: chapter.candidateContent,
    }))).toEqual([
      { id: "chapter-1", status: "pending", sourceContent: "第一章原文", candidateContent: null },
      { id: "chapter-2", status: "pending", sourceContent: "第二章原文", candidateContent: null },
    ])
    expect(memory.atomicWrites).toEqual(expect.arrayContaining([
      "C:/作品库/甲/.qmai/de-ai-batch/tasks/task-a/task.json",
      "C:/作品库/甲/.qmai/de-ai-batch/tasks/task-a/chapters/chapter-1.json",
      "C:/作品库/甲/.qmai/de-ai-batch/tasks/task-a/chapters/chapter-2.json",
    ]))
    expect(memory.io.writeFileAtomic).toHaveBeenCalledTimes(3)
  })

  it("重启加载时把运行中的任务和章节改为 interrupted 且保留候选结果", async () => {
    const storage = createDeAiBatchStorage(memory.io, { now: () => 10, id: () => "task-a" })
    const created = await storage.createTask(taskInput())
    await storage.saveTask(runningTask(created.task))
    await storage.saveChapter(generatingChapter({
      ...created.chapters[0],
      candidateContent: "上次完整候选",
    }))

    const restarted = createDeAiBatchStorage(memory.io, { now: () => 30, id: () => "unused" })
    const loaded = await restarted.loadProject("C:/作品库/甲")

    expect(loaded).toHaveLength(1)
    expect(loaded[0].task).toMatchObject({ status: "interrupted", error: "软件上次关闭时任务尚未完成" })
    expect(loaded[0].chapters[0]).toMatchObject({
      status: "pending",
      runId: null,
      candidateContent: "上次完整候选",
      error: "软件上次关闭时章节尚未完成，可继续处理",
    })
  })

  it("仅凭持久化原文副本即可再次加载，不读取原始章节文件", async () => {
    const storage = createDeAiBatchStorage(memory.io, { now: () => 10, id: () => "task-a" })
    await storage.createTask(taskInput())
    vi.mocked(memory.io.readFile).mockClear()

    const loaded = await storage.loadTask("C:/作品库/甲", "task-a")

    expect(loaded?.chapters[0].sourceContent).toBe("第一章原文")
    expect(memory.io.readFile).not.toHaveBeenCalledWith("C:/作品库/甲/wiki/chapters/第一章.md")
  })

  it("拒绝包含路径穿越字符的任务或章节 ID", async () => {
    const storage = createDeAiBatchStorage(memory.io, { now: () => 10, id: () => "../task" })

    await expect(storage.createTask(taskInput())).rejects.toThrow("任务 ID 不合法")

    const validStorage = createDeAiBatchStorage(memory.io, { now: () => 10, id: () => "task-a" })
    await expect(validStorage.createTask(taskInput({
      chapters: [{ ...taskInput().chapters[0], id: "../chapter" }],
    }))).rejects.toThrow("章节 ID 不合法")
  })
  it.each([
    ["父目录穿越", "C:/作品库/甲/wiki/chapters/../机密.md"],
    ["章节目录前缀伪装", "C:/作品库/甲/wiki/chapters-evil/第一章.md"],
    ["跨盘路径", "D:/作品库/甲/wiki/chapters/第一章.md"],
    ["UNC 路径", "//server/share/第一章.md"],
    ["大小写前缀伪装", "c:/作品库/甲/WIKI/CHAPTERS-EVIL/第一章.md"],
  ])("创建任务时拒绝%s的 sourcePath", async (_label, sourcePath) => {
    const storage = createDeAiBatchStorage(memory.io, { now: () => 10, id: () => "task-a" })
    await expect(storage.createTask(taskInput({ chapters: [{ ...taskInput().chapters[0], sourcePath }] })))
      .rejects.toThrow("章节源文件不属于当前项目章节目录")
  })

  it("允许 Windows 路径大小写不同但仍真实位于当前章节目录", async () => {
    const storage = createDeAiBatchStorage(memory.io, { now: () => 10, id: () => "task-a" })
    await expect(storage.createTask(taskInput({
      chapters: [{ ...taskInput().chapters[0], sourcePath: "c:/作品库/甲/WIKI/CHAPTERS/第一章.md" }],
    }))).resolves.toBeTruthy()
  })

  it("加载时拒绝 checkpoint 篡改后越出真实项目章节目录的 sourcePath", async () => {
    const storage = createDeAiBatchStorage(memory.io, { now: () => 10, id: () => "task-a" })
    await storage.createTask(taskInput())
    const checkpointPath = "C:/作品库/甲/.qmai/de-ai-batch/tasks/task-a/chapters/chapter-1.json"
    const checkpoint = JSON.parse(memory.files.get(checkpointPath)!) as DeAiBatchChapter
    memory.files.set(checkpointPath, JSON.stringify({ ...checkpoint, sourcePath: "C:/作品库/甲/wiki/chapters/../../项目外.md" }))
    await expect(storage.loadTask("C:/作品库/甲", "task-a"))
      .rejects.toThrow("章节源文件不属于当前项目章节目录")
  })
  it("重启加载时把仍在排队的 queued 任务转为 interrupted 并保留原文副本", async () => {
    const storage = createDeAiBatchStorage(memory.io, { now: () => 10, id: () => "task-queued" })
    await storage.createTask(taskInput())

    const restarted = createDeAiBatchStorage(memory.io, { now: () => 40, id: () => "unused" })
    const loaded = await restarted.loadProject("C:/作品库/甲")

    expect(loaded[0].task).toMatchObject({
      id: "task-queued",
      status: "interrupted",
      error: "软件上次关闭时任务尚未开始，可继续处理",
    })
    expect(loaded[0].chapters.map((chapter) => chapter.sourceContent)).toEqual(["第一章原文", "第二章原文"])
  })
})

