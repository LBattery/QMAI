import { createDirectory, deleteFile, listDirectory, readFile, writeFileAtomic } from "@/commands/fs"
import { normalizePath } from "@/lib/path-utils"
import type { FileNode } from "@/types/wiki"
import {
  createPlotDiscussionSession,
  summarizePlotDiscussionSession,
  type PlotDiscussionSession,
  type PlotDiscussionSessionSummary,
} from "./plot-discussion"

const DISCUSSIONS_DIR = ".qmai/director-room/discussions"
const EXPORTS_DIR = ".qmai/director-room/exports"

function discussionsDir(projectPath: string): string {
  return `${normalizePath(projectPath)}/${DISCUSSIONS_DIR}`
}

function discussionPath(projectPath: string, id: string): string {
  return `${discussionsDir(projectPath)}/${id}.json`
}

function normalizeSession(value: unknown): PlotDiscussionSession | null {
  if (!value || typeof value !== "object") return null
  const session = value as Partial<PlotDiscussionSession>
  if (!session.id || !session.createdAt) return null
  return {
    ...createPlotDiscussionSession(),
    ...session,
    title: session.title || "未命名讨论",
    sourceChapters: Number.isFinite(session.sourceChapters) ? Number(session.sourceChapters) : 10,
    selectedCharacterIds: Array.isArray(session.selectedCharacterIds) ? session.selectedCharacterIds : [],
    context: session.context ?? null,
    messages: Array.isArray(session.messages) ? session.messages : [],
    directions: Array.isArray(session.directions) ? session.directions : [],
    updatedAt: session.updatedAt || session.createdAt,
  }
}

export async function savePlotDiscussion(
  projectPath: string,
  session: PlotDiscussionSession,
): Promise<void> {
  await createDirectory(discussionsDir(projectPath))
  await writeFileAtomic(discussionPath(projectPath, session.id), JSON.stringify(session, null, 2))
}

export async function loadPlotDiscussion(
  projectPath: string,
  id: string,
): Promise<PlotDiscussionSession | null> {
  try {
    const raw = await readFile(discussionPath(projectPath, id))
    return normalizeSession(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function loadPlotDiscussionSummaries(
  projectPath: string,
): Promise<PlotDiscussionSessionSummary[]> {
  let entries: FileNode[]
  try {
    entries = await listDirectory(discussionsDir(projectPath))
  } catch {
    return []
  }
  const summaries: PlotDiscussionSessionSummary[] = []
  for (const entry of entries) {
    if (entry.is_dir || !entry.name.toLowerCase().endsWith(".json")) continue
    try {
      const raw = await readFile(entry.path)
      const session = normalizeSession(JSON.parse(raw))
      if (session) summaries.push(summarizePlotDiscussionSession(session))
    } catch {
      // Skip malformed discussion files without blocking the room.
    }
  }
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function deletePlotDiscussion(projectPath: string, id: string): Promise<void> {
  await deleteFile(discussionPath(projectPath, id))
}

export function plotDiscussionToMarkdown(session: PlotDiscussionSession): string {
  const lines = [`# ${session.title}`, ""]
  for (const message of session.messages) {
    const replyLabel = message.replyToSpeakerName ? `（回应 ${message.replyToSpeakerName}）` : ""
    lines.push(`## ${message.speakerName}${replyLabel}`, "", message.content, "")
  }
  if (session.directions.length > 0) {
    lines.push("# 灵感方向", "")
    for (const direction of session.directions) {
      lines.push(`## ${direction.pinned ? "[保留] " : ""}${direction.title}`, "")
      lines.push(direction.possibility, "")
      if (direction.spark) lines.push(`- 火花：${direction.spark}`)
      if (direction.tradeoff) lines.push(`- 代价：${direction.tradeoff}`)
      lines.push("")
    }
  }
  return lines.join("\n")
}

export async function exportPlotDiscussion(
  projectPath: string,
  session: PlotDiscussionSession,
): Promise<string> {
  const dir = `${normalizePath(projectPath)}/${EXPORTS_DIR}`
  await createDirectory(dir)
  const path = `${dir}/${session.id}.md`
  await writeFileAtomic(path, plotDiscussionToMarkdown(session))
  return path
}
