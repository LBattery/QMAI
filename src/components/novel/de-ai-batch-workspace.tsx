import { useEffect, useMemo, useRef, useState } from "react"
import { WandSparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DeAiBatchReviewDialog } from "@/components/novel/de-ai-batch-review-dialog"
import { DeAiBatchStartDialog, type DeAiBatchSelection } from "@/components/novel/de-ai-batch-start-dialog"
import { DeAiBatchTaskPanel } from "@/components/novel/de-ai-batch-task-panel"
import { readFile } from "@/commands/fs"
import { toast } from "@/lib/toast"
import { buildDeAiSystemPrompt } from "@/lib/novel/de-ai-adapter"
import { loadEffectiveDeAiSkillSafely } from "@/lib/novel/de-ai-skill-library"
import { buildDeAiBatchCatalog } from "@/lib/novel/de-ai-batch/catalog"
import { resolveDeAiBatchModelKey } from "@/lib/novel/de-ai-batch/llm-runner"
import { createLatestValueSaveQueue } from "@/lib/novel/de-ai-batch/latest-value-save-queue"
import { saveNovelConfig } from "@/lib/project-store"
import { useDeAiBatchStore } from "@/stores/de-ai-batch-store"
import { useWikiStore } from "@/stores/wiki-store"
import type { CreateDeAiBatchTaskInput } from "@/lib/novel/de-ai-batch/types"

export function DeAiBatchWorkspace() {
  const project = useWikiStore((state) => state.project)
  const fileTree = useWikiStore((state) => state.fileTree)
  const novelConfig = useWikiStore((state) => state.novelConfig)
  const records = useDeAiBatchStore((state) => state.records)
  const concurrency = useDeAiBatchStore((state) => state.concurrency)
  const panelCollapsed = useDeAiBatchStore((state) => state.panelCollapsed)
  const reviewOpen = useDeAiBatchStore((state) => state.reviewOpen)
  const reviewTaskId = useDeAiBatchStore((state) => state.reviewTaskId)
  const reviewChapterId = useDeAiBatchStore((state) => state.reviewChapterId)
  const [startOpen, setStartOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const pendingActionKeysRef = useRef(new Set<string>())
  const [pendingActionKeys, setPendingActionKeys] = useState<ReadonlySet<string>>(new Set())

  const catalog = useMemo(
    () => project ? buildDeAiBatchCatalog(project, fileTree) : [],
    [fileTree, project],
  )
  const concurrencySaveQueue = useMemo(() => project
    ? createLatestValueSaveQueue((config: typeof novelConfig) => saveNovelConfig(config, project.id, project.path))
    : null, [project?.id, project?.path])
  const reviewRecord = records.find((record) => record.task.id === reviewTaskId) ?? null
  const pendingTaskIds = useMemo(() => new Set(Array.from(pendingActionKeys).flatMap((key) => key.startsWith("task:") ? [key.slice(5)] : [])), [pendingActionKeys])
  const reviewPending = (!!reviewTaskId && pendingTaskIds.has(reviewTaskId))
    || (!!reviewTaskId && !!reviewChapterId && pendingActionKeys.has(`chapter:${reviewTaskId}:${reviewChapterId}`))

  useEffect(() => {
    if (!project) return
    const store = useDeAiBatchStore.getState()
    void store.initializeProject(project.path).catch((error) => {
      console.error("加载批量去 AI 味任务失败", error)
      toast.error("加载批量去 AI 味任务失败，请稍后重试。")
    })
    return () => store.dispose()
  }, [project?.id, project?.path])

  useEffect(() => {
    useDeAiBatchStore.getState().setConcurrency(novelConfig.deAiBatchConcurrency)
  }, [novelConfig.deAiBatchConcurrency])

  if (!project) return null
  const activeProject = project

  async function runWorkspaceAction(
    key: string,
    label: string,
    action: () => Promise<unknown>,
  ): Promise<void> {
    if (pendingActionKeysRef.current.has(key)) return
    pendingActionKeysRef.current.add(key)
    setPendingActionKeys(new Set(pendingActionKeysRef.current))
    try {
      await action()
    } catch (error) {
      console.error(`${label}失败`, error)
      toast.error(`操作失败：${label}。${error instanceof Error ? error.message : String(error)}`)
    } finally {
      pendingActionKeysRef.current.delete(key)
      setPendingActionKeys(new Set(pendingActionKeysRef.current))
    }
  }
  async function handleStart(selection: DeAiBatchSelection[]): Promise<void> {
    if (startingRef.current) return
    startingRef.current = true
    setStarting(true)
    try {
      const wikiState = useWikiStore.getState()
      const modelKey = resolveDeAiBatchModelKey({
        taskModel: wikiState.novelConfig.deAiModel,
        defaultModel: wikiState.novelConfig.defaultLlmModel || wikiState.defaultLlmModel,
        chatModel: wikiState.aiChatModel,
        baseConfig: wikiState.llmConfig,
        providerConfigs: wikiState.providerConfigs,
      })
      if (!modelKey) {
        toast.error("未配置可用的去 AI 味模型，请先到小说设置中配置。")
        return
      }
      const effective = await loadEffectiveDeAiSkillSafely(activeProject.path)
      if (effective.warning) toast.info(effective.warning)
      const skillContent = effective.skill?.content || buildDeAiSystemPrompt()
      const skillName = effective.skill?.name || "系统默认去 AI 味规则"
      const inputs: CreateDeAiBatchTaskInput[] = []
      for (const selectedWork of selection) {
        const work = catalog.find((item) => item.id === selectedWork.workId)
        if (!work) continue
        const selectedIds = new Set(selectedWork.chapterIds)
        const chapters = []
        for (const chapter of work.chapters) {
          if (!selectedIds.has(chapter.id)) continue
          chapters.push({
            ...chapter,
            sourceContent: await readFile(chapter.sourcePath),
          })
        }
        if (chapters.length === 0) continue
        inputs.push({
          projectPath: activeProject.path,
          workId: work.id,
          workTitle: work.title,
          modelKey,
          skillId: effective.skill?.id ?? null,
          skillName,
          skillContent,
          chapters,
        })
      }
      if (inputs.length === 0) {
        toast.error("请选择至少一个可读取的章节。")
        return
      }
      await useDeAiBatchStore.getState().createBatch(inputs)
      setStartOpen(false)
      toast.success(`已创建 ${inputs.length} 个作品的批量去 AI 味任务。`)
    } catch (error) {
      console.error("创建批量去 AI 味任务失败", error)
      toast.error(`创建批量去 AI 味任务失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      startingRef.current = false
      setStarting(false)
    }
  }

  function handleConcurrencyChange(value: number): void {
    useDeAiBatchStore.getState().setConcurrency(value)
    const wikiState = useWikiStore.getState()
    const nextConfig = { ...wikiState.novelConfig, deAiBatchConcurrency: value }
    wikiState.setNovelConfig(nextConfig)
    const saving = concurrencySaveQueue?.enqueue(nextConfig)
    if (saving) {
      void saving.catch((error) => {
        console.error("保存批量去 AI 味并发设置失败", error)
        toast.error(`保存批量去 AI 味并发设置失败：${error instanceof Error ? error.message : String(error)}`)
      })
    }
  }

  return (
    <>
      <aside className="fixed right-4 top-16 z-40 flex w-[min(26rem,calc(100vw-2rem))] max-h-[calc(100dvh-5rem)] flex-col gap-2" aria-label="批量去 AI 味工作区">
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => setStartOpen(true)} disabled={starting}>
            <WandSparkles className="h-4 w-4" />
            {starting ? "正在创建..." : "批量去 AI 味"}
          </Button>
        </div>
        <DeAiBatchTaskPanel
          records={records}
          collapsed={panelCollapsed}
          pendingTaskIds={pendingTaskIds}
          onCollapsedChange={(collapsed) => useDeAiBatchStore.getState().setPanelCollapsed(collapsed)}
          onContinue={(taskId) => runWorkspaceAction(`task:${taskId}`, "继续批量去 AI 味任务", () => useDeAiBatchStore.getState().continueTask(taskId))}
          onReview={(taskId) => {
            const record = useDeAiBatchStore.getState().records.find((item) => item.task.id === taskId)
            const chapterId = record?.chapters.find((chapter) => chapter.status === "ready")?.id
              ?? record?.chapters[0]?.id
            useDeAiBatchStore.getState().openReview(taskId, chapterId)
          }}
          onCancel={(taskId) => runWorkspaceAction(`task:${taskId}`, "取消批量去 AI 味任务", () => useDeAiBatchStore.getState().cancelTask(taskId))}
        />
      </aside>

      <DeAiBatchStartDialog
        open={startOpen}
        works={catalog}
        concurrency={concurrency}
        starting={starting}
        onConcurrencyChange={handleConcurrencyChange}
        onStart={handleStart}
        onClose={() => setStartOpen(false)}
      />

      <DeAiBatchReviewDialog
        open={reviewOpen}
        record={reviewRecord}
        currentChapterId={reviewChapterId}
        pending={reviewPending}
        onSelectChapter={(chapterId) => useDeAiBatchStore.getState().setReviewChapter(chapterId)}
        onConfirm={(taskId, chapterId, candidateContent) => runWorkspaceAction(`chapter:${taskId}:${chapterId}`, "确认当前章节", () => useDeAiBatchStore.getState().confirmChapter(taskId, chapterId, candidateContent))}
        onRegenerate={(taskId, chapterId) => runWorkspaceAction(`chapter:${taskId}:${chapterId}`, "重新生成当前章节", () => useDeAiBatchStore.getState().regenerateChapter(taskId, chapterId))}
        onCancelChapter={(taskId, chapterId) => runWorkspaceAction(`chapter:${taskId}:${chapterId}`, "取消当前章节", () => useDeAiBatchStore.getState().cancelChapter(taskId, chapterId))}
        onClose={() => useDeAiBatchStore.getState().closeReview()}
      />
    </>
  )
}
