import {
  createDirectory,
  listDirectory,
  readFile,
  writeFileAtomic,
} from "@/commands/fs"
import { normalizePath } from "@/lib/path-utils"
import { assertChapterSourcePath } from "./chapter-path"
import type {
  CreateDeAiBatchTaskInput,
  DeAiBatchChapter,
  DeAiBatchTask,
  DeAiBatchTaskRecord,
} from "./types"

const TASK_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const TASK_INTERRUPTED_ERROR = "软件上次关闭时任务尚未完成"
const QUEUED_INTERRUPTED_ERROR = "软件上次关闭时任务尚未开始，可继续处理"
const CHAPTER_INTERRUPTED_ERROR = "软件上次关闭时章节尚未完成，可继续处理"

export interface DeAiBatchStorageEntry {
  name: string
  path: string
}

export interface DeAiBatchStorageIo {
  createDirectory(path: string): Promise<void>
  writeFileAtomic(path: string, content: string): Promise<void>
  readFile(path: string): Promise<string>
  listDirectory(path: string): Promise<DeAiBatchStorageEntry[]>
}

export interface DeAiBatchStorageOptions {
  now?: () => number
  id?: () => string
}

const defaultIo: DeAiBatchStorageIo = {
  createDirectory,
  writeFileAtomic,
  readFile,
  listDirectory: async (path) => listDirectory(path, { maxDepth: 1 }),
}

function joinPath(...parts: string[]): string {
  return normalizePath(parts.join("/")).replace(/\/{2,}/g, "/")
}

function rootPath(projectPath: string): string {
  return joinPath(projectPath, ".qmai", "de-ai-batch", "tasks")
}

function taskPath(projectPath: string, taskId: string): string {
  return joinPath(rootPath(projectPath), taskId)
}

function taskFilePath(projectPath: string, taskId: string): string {
  return joinPath(taskPath(projectPath, taskId), "task.json")
}

function chapterFilePath(projectPath: string, taskId: string, chapterId: string): string {
  return joinPath(taskPath(projectPath, taskId), "chapters", `${chapterId}.json`)
}

function assertId(kind: "任务" | "章节", id: string): void {
  if (!TASK_ID_PATTERN.test(id)) throw new Error(`${kind} ID 不合法：${id || "空值"}`)
}

function safeParse<T>(content: string, label: string): T {
  try {
    return JSON.parse(content) as T
  } catch {
    throw new Error(`${label}数据损坏`)
  }
}

function createTaskId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `de-ai-${crypto.randomUUID()}`
  }
  return `de-ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function createDeAiBatchStorage(
  io: DeAiBatchStorageIo = defaultIo,
  options: DeAiBatchStorageOptions = {},
) {
  const now = options.now ?? Date.now
  const nextId = options.id ?? createTaskId
  let saveChain: Promise<void> = Promise.resolve()

  function serialize(write: () => Promise<void>): Promise<void> {
    const next = saveChain.then(write, write)
    saveChain = next.catch(() => undefined)
    return next
  }

  async function ensureTaskDirectories(projectPath: string, taskId: string): Promise<void> {
    await io.createDirectory(joinPath(projectPath, ".qmai"))
    await io.createDirectory(joinPath(projectPath, ".qmai", "de-ai-batch"))
    await io.createDirectory(rootPath(projectPath))
    await io.createDirectory(taskPath(projectPath, taskId))
    await io.createDirectory(joinPath(taskPath(projectPath, taskId), "chapters"))
  }

  async function saveTask(task: DeAiBatchTask): Promise<void> {
    assertId("任务", task.id)
    await serialize(async () => {
      await ensureTaskDirectories(task.projectPath, task.id)
      await io.writeFileAtomic(taskFilePath(task.projectPath, task.id), JSON.stringify(task, null, 2))
    })
  }

  async function saveChapter(chapter: DeAiBatchChapter, projectPath?: string): Promise<void> {
    assertId("任务", chapter.taskId)
    assertId("章节", chapter.id)
    const targetProjectPath = projectPath ?? activeProjectPaths.get(chapter.taskId)
    if (!targetProjectPath) throw new Error(`找不到章节所属项目：${chapter.taskId}`)
    await serialize(async () => {
      await ensureTaskDirectories(targetProjectPath, chapter.taskId)
      await io.writeFileAtomic(
        chapterFilePath(targetProjectPath, chapter.taskId, chapter.id),
        JSON.stringify(chapter, null, 2),
      )
    })
  }

  const activeProjectPaths = new Map<string, string>()

  async function createTask(input: CreateDeAiBatchTaskInput): Promise<DeAiBatchTaskRecord> {
    const id = nextId()
    assertId("任务", id)
    if (input.chapters.length === 0) throw new Error("请至少选择一个章节")
    const chapterIds = new Set<string>()
    for (const chapter of input.chapters) {
      assertId("章节", chapter.id)
      if (chapterIds.has(chapter.id)) throw new Error(`章节 ID 重复：${chapter.id}`)
      chapterIds.add(chapter.id)
    }
    const timestamp = now()
    const task: DeAiBatchTask = {
      version: 1,
      id,
      projectPath: normalizePath(input.projectPath),
      workId: input.workId,
      workTitle: input.workTitle,
      modelKey: input.modelKey,
      skillId: input.skillId,
      skillName: input.skillName,
      skillContent: input.skillContent,
      status: "queued",
      chapterIds: input.chapters.map((chapter) => chapter.id),
      error: null,
      createdAt: timestamp,
      startedAt: null,
      completedAt: null,
      updatedAt: timestamp,
    }
    const chapters: DeAiBatchChapter[] = input.chapters.map((chapter) => ({
      version: 1,
      id: chapter.id,
      taskId: id,
      title: chapter.title,
      order: chapter.order,
      sourcePath: assertChapterSourcePath(task.projectPath, chapter.sourcePath),
      sourceContent: chapter.sourceContent,
      candidateContent: null,
      status: "pending",
      runId: null,
      generation: 0,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }))
    activeProjectPaths.set(id, task.projectPath)
    await ensureTaskDirectories(task.projectPath, id)
    for (const chapter of chapters) await saveChapter(chapter, task.projectPath)
    await saveTask(task)
    return { task, chapters }
  }

  async function loadTask(projectPath: string, taskId: string): Promise<DeAiBatchTaskRecord | null> {
    assertId("任务", taskId)
    let task: DeAiBatchTask
    try {
      task = safeParse<DeAiBatchTask>(await io.readFile(taskFilePath(projectPath, taskId)), "任务")
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("missing:")) return null
      throw error
    }
    if (task.id !== taskId || normalizePath(task.projectPath) !== normalizePath(projectPath)) {
      throw new Error(`任务身份不匹配：${taskId}`)
    }
    activeProjectPaths.set(taskId, normalizePath(projectPath))
    const chapters: DeAiBatchChapter[] = []
    for (const chapterId of task.chapterIds) {
      assertId("章节", chapterId)
      const chapter = safeParse<DeAiBatchChapter>(
        await io.readFile(chapterFilePath(projectPath, taskId, chapterId)),
        "章节",
      )
      assertChapterSourcePath(projectPath, chapter.sourcePath)
      if (chapter.id !== chapterId || chapter.taskId !== taskId) {
        throw new Error(`章节身份不匹配：${chapterId}`)
      }
      chapters.push(chapter)
    }
    return { task, chapters: chapters.sort((a, b) => a.order - b.order) }
  }

  async function loadProject(projectPath: string): Promise<DeAiBatchTaskRecord[]> {
    let entries: DeAiBatchStorageEntry[]
    try {
      entries = await io.listDirectory(rootPath(projectPath))
    } catch {
      return []
    }
    const records: DeAiBatchTaskRecord[] = []
    for (const entry of entries) {
      if (!TASK_ID_PATTERN.test(entry.name)) continue
      const record = await loadTask(projectPath, entry.name)
      if (!record) continue
      let changed = false
      if (record.task.status === "running" || record.task.status === "queued") {
        record.task = {
          ...record.task,
          status: "interrupted",
          error: record.task.status === "queued" ? QUEUED_INTERRUPTED_ERROR : TASK_INTERRUPTED_ERROR,
          completedAt: null,
          updatedAt: now(),
        }
        changed = true
      }
      for (let index = 0; index < record.chapters.length; index += 1) {
        const chapter = record.chapters[index]
        if (chapter.status !== "generating") continue
        record.chapters[index] = {
          ...chapter,
          status: "pending",
          runId: null,
          error: CHAPTER_INTERRUPTED_ERROR,
          updatedAt: now(),
        }
        await saveChapter(record.chapters[index], projectPath)
      }
      if (changed) await saveTask(record.task)
      records.push(record)
    }
    return records.sort((a, b) => a.task.createdAt - b.task.createdAt)
  }

  return { createTask, saveTask, saveChapter, loadTask, loadProject }
}

export type DeAiBatchStorage = ReturnType<typeof createDeAiBatchStorage>
