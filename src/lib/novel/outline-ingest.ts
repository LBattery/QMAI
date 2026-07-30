import { fileExists, listDirectory } from "@/commands/fs"
import i18n from "@/i18n"
import { normalizePath } from "@/lib/path-utils"
import { refreshProjectState } from "@/lib/project-refresh"
import { useImportProgressStore } from "@/stores/import-progress-store"
import { useOutlineGenerationStore } from "@/stores/outline-generation-store"
import { ingestOutline } from "./chapter-ingest"

export function createOutlineIngestTask(projectPath: string, outlinePath: string): string {
  return useOutlineGenerationStore.getState().createTask({
    projectPath: normalizePath(projectPath),
    kind: "ingest",
    outlinePath: normalizePath(outlinePath),
    status: "ingesting",
    message: i18n.t("novel.outlineGenerator.ingestingNotification"),
    error: null,
  })
}

export function startOutlineIngestTask(projectPath: string, outlinePath: string): string {
  const taskId = createOutlineIngestTask(projectPath, outlinePath)
  void runOutlineIngestTask(taskId)
  return taskId
}

function collectOutlineMarkdownPaths(
  nodes: Array<{ path: string; name: string; is_dir: boolean; children?: Array<{ path: string; name: string; is_dir: boolean; children?: unknown[] }> }>,
): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      paths.push(...collectOutlineMarkdownPaths(node.children as Array<{ path: string; name: string; is_dir: boolean; children?: Array<{ path: string; name: string; is_dir: boolean; children?: unknown[] }> }>))
      continue
    }
    if (!node.is_dir && node.name.endsWith(".md")) {
      paths.push(normalizePath(node.path))
    }
  }
  return paths
}

export async function runBulkOutlineIngest(projectPath: string): Promise<{
  total: number
  succeeded: number
  failed: number
}> {
  const pp = normalizePath(projectPath)
  let outlinePaths: string[] = []

  try {
    const tree = await listDirectory(`${pp}/wiki/outlines`)
    outlinePaths = collectOutlineMarkdownPaths(tree as Array<{ path: string; name: string; is_dir: boolean; children?: Array<{ path: string; name: string; is_dir: boolean; children?: unknown[] }> }>)
      .sort((a, b) => a.localeCompare(b, "zh-CN"))
  } catch {
    return { total: 0, succeeded: 0, failed: 0 }
  }

  let succeeded = 0
  let failed = 0

  for (const outlinePath of outlinePaths) {
    const taskId = createOutlineIngestTask(pp, outlinePath)
    await runOutlineIngestTask(taskId)
    const task = useOutlineGenerationStore.getState().tasks.find((item) => item.id === taskId)
    if (task?.status === "done") succeeded += 1
    else failed += 1
  }

  return {
    total: outlinePaths.length,
    succeeded,
    failed,
  }
}

export async function runOutlineIngestTask(taskId: string): Promise<void> {
  const task = useOutlineGenerationStore.getState().tasks.find((item) => item.id === taskId)
  if (!task?.outlinePath) return

  const outlineFileName = task.outlinePath.split("/").pop()?.replace(".md", "") || "大纲"
  const abortController = new AbortController()
  const progressTaskId = useImportProgressStore.getState().startTask({
    projectPath: task.projectPath,
    kind: "outline",
    total: 1,
    currentTitle: outlineFileName,
    message: "正在提取大纲记忆",
    abortController,
  })

  try {
    useOutlineGenerationStore.getState().updateTask(taskId, {
      status: "ingesting",
      message: i18n.t("novel.outlineGenerator.ingestingNotification"),
      error: null,
    })
    const snapshot = await ingestOutline(task.projectPath, task.outlinePath, abortController.signal)
    if (snapshot) {
      await refreshProjectState(task.projectPath)
    }
    useOutlineGenerationStore.getState().updateTask(taskId, {
      status: snapshot ? "done" : "error",
      message: snapshot
        ? i18n.t("novel.outlineGenerator.ingestSuccessNotification")
        : i18n.t("novel.outlineGenerator.ingestFailedNotification"),
      error: snapshot ? null : i18n.t("novel.outlineGenerator.ingestFailedNotification"),
    })
    useImportProgressStore.getState().finishTask(progressTaskId, snapshot ? "done" : "error", {
      completed: snapshot ? 1 : 0,
      total: 1,
      currentTitle: "",
      message: snapshot ? `${outlineFileName} 提取完成` : `${outlineFileName} 提取失败`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    useOutlineGenerationStore.getState().updateTask(taskId, {
      status: "error",
      message,
      error: message,
    })
    useImportProgressStore.getState().finishTask(progressTaskId, "error", {
      completed: 0,
      total: 1,
      currentTitle: "",
      message: `${outlineFileName} 提取失败`,
    })
  }
}

export async function hasIngestedOutlineSnapshot(projectPath: string, outlinePath: string): Promise<boolean> {
  const normalizedOutlinePath = normalizePath(outlinePath)
  const fileName = normalizedOutlinePath.split("/").pop() ?? "outline"
  const outlineName = fileName.replace(/\.\w+$/, "")
  let hash = 0
  for (let i = 0; i < outlineName.length; i++) {
    hash = ((hash << 5) - hash + outlineName.charCodeAt(i)) | 0
  }
  const outlineNum = -(Math.abs(hash % 999) + 1)
  const prefix = `outline-${String(Math.abs(outlineNum)).padStart(3, "0")}`
  const jsonPath = `${normalizePath(projectPath)}/.novel/snapshots/${prefix}.snapshot.json`
  return fileExists(jsonPath).catch(() => false)
}
