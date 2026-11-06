import { isTauri } from "@/lib/platform"
import { invoke } from "@tauri-apps/api/core"

export type FileChangeKind = "created" | "modified" | "deleted"
export type FileChangeStatus = "pending" | "processing" | "done" | "failed" | "superseded"

export interface FileChangeTask {
  id: string
  projectId: string
  path: string
  kind: FileChangeKind
  status: FileChangeStatus
  hashBefore?: string | null
  hashAfter?: string | null
  size?: number | null
  mtimeMs?: number | null
  createdAt: number
  updatedAt: number
  retryCount: number
  error?: string | null
  needsRerun: boolean
}

export function stopProjectFileWatcher(): Promise<void> {
  if (!isTauri() && import.meta.env.MODE !== "test") return Promise.resolve()
  return invoke<void>("stop_project_file_watcher")
}
