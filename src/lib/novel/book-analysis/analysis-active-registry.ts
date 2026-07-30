import { normalizePath } from "@/lib/path-utils"
import type { BookAnalysisPipelineTask } from "./analysis-pipeline-types"

const snapshots = new Map<string, BookAnalysisPipelineTask[]>()
const ACTIVE_STATUSES = new Set(["queued", "running", "paused"])

function key(projectPath: string): string {
  return normalizePath(projectPath).replace(/\/+$/, "")
}

export function setActiveAnalysisSnapshot(projectPath: string, tasks: BookAnalysisPipelineTask[]): void {
  snapshots.set(key(projectPath), tasks)
}

export function clearActiveAnalysisSnapshot(projectPath: string): void {
  snapshots.delete(key(projectPath))
}

export function hasActiveAnalysisForBook(projectPath: string, bookId: string): boolean {
  return (snapshots.get(key(projectPath)) ?? []).some((task) => (
    task.bookId === bookId && ACTIVE_STATUSES.has(task.status)
  ))
}
