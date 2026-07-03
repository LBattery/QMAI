import { useCallback, useMemo, useState } from "react"
import { Loader2, MessageSquare, Sparkles, Lightbulb, NotebookPen } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { OutlineGeneratorDialog, type OutlineGeneratorMode } from "@/components/sources/outline-generator-dialog"
import { InspirationDialog } from "@/components/sources/inspiration-dialog"
import { runBulkOutlineIngest } from "@/lib/novel/outline-generation"
import { cn } from "@/lib/utils"
import { useOutlineGenerationStore } from "@/stores/outline-generation-store"
import { useInspirationNotesStore } from "@/stores/inspiration-notes-store"
import { useWikiStore } from "@/stores/wiki-store"

interface OutlineActionToolbarProps {
  className?: string
  onBulkIngestResult?: (message: string | null) => void
  onToggleOutlineChat?: () => void
}

export function OutlineActionToolbar({
  className,
  onBulkIngestResult,
  onToggleOutlineChat,
}: OutlineActionToolbarProps) {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const outlineTasks = useOutlineGenerationStore((s) => s.tasks)
  const setOutlineChatOpen = useOutlineGenerationStore((s) => s.setPanelOpen)
  const setNotesPanelOpen = useInspirationNotesStore((s) => s.setPanelOpen)
  const notesPanelOpen = useInspirationNotesStore((s) => s.panelOpen)
  const [outlineDialogOpen, setOutlineDialogOpen] = useState(false)
  const [outlineDialogMode, setOutlineDialogMode] = useState<OutlineGeneratorMode>("outline")
  const [bulkIngestRunning, setBulkIngestRunning] = useState(false)
  const [inspirationOpen, setInspirationOpen] = useState(false)

  const bulkIngesting = useMemo(() => (
    project != null && outlineTasks.some((task) => (
      task.projectPath === project.path &&
      task.kind === "ingest" &&
      task.status === "ingesting"
    ))
  ), [outlineTasks, project])

  function openOutlineDialog(mode: OutlineGeneratorMode) {
    setOutlineDialogMode(mode)
    setOutlineDialogOpen(true)
  }

  const handleOpenOutlineChat = useCallback(() => {
    if (onToggleOutlineChat) {
      onToggleOutlineChat()
      return
    }
    setNotesPanelOpen(false)
    setOutlineChatOpen(true)
    setActiveView("sources")
  }, [onToggleOutlineChat, setActiveView, setOutlineChatOpen, setNotesPanelOpen])

  const handleToggleNotes = useCallback(() => {
    const nextOpen = !notesPanelOpen
    setNotesPanelOpen(nextOpen)
    if (nextOpen) {
      // The dock slot can only host one panel — close the outline chat
      // when the notes panel opens, and surface the outline page so the
      // docked panel is visible.
      setOutlineChatOpen(false)
      setActiveView("sources")
    }
  }, [notesPanelOpen, setNotesPanelOpen, setOutlineChatOpen, setActiveView])

  const handleBulkIngest = useCallback(async () => {
    if (!project || bulkIngestRunning || bulkIngesting) return
    setBulkIngestRunning(true)
    onBulkIngestResult?.(null)
    try {
      const result = await runBulkOutlineIngest(project.path)
      if (result.total === 0) {
        onBulkIngestResult?.(t("novel.outlineGenerator.bulkIngestEmpty"))
      } else {
        onBulkIngestResult?.(t("novel.outlineGenerator.bulkIngestResult", result))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      onBulkIngestResult?.(t("novel.outlineGenerator.bulkIngestError", { message }))
    } finally {
      setBulkIngestRunning(false)
    }
  }, [bulkIngestRunning, bulkIngesting, onBulkIngestResult, project, t])

  return (
    <>
      <div className={cn("flex flex-wrap gap-1", className)}>
        <Button size="sm" onClick={() => openOutlineDialog("outline")}>
          <Sparkles className="mr-1 h-4 w-4" />
          {t("novel.outlineGenerator.title")}
        </Button>
        <Button size="sm" variant="outline" onClick={handleOpenOutlineChat}>
          <MessageSquare className="mr-1 h-4 w-4" />
          AI大纲
        </Button>
        <Button size="sm" variant="outline" onClick={() => openOutlineDialog("continue")}>
          <Sparkles className="mr-1 h-4 w-4" />
          {t("novel.outlineGenerator.continueTitle")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setInspirationOpen(true)}>
          <Lightbulb className="mr-1 h-4 w-4" />
          {t("novel.inspiration.button")}
        </Button>
        <Button size="sm" variant="outline" onClick={handleToggleNotes}>
          <NotebookPen className="mr-1 h-4 w-4" />
          {t("novel.inspirationNotes.button")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => openOutlineDialog("refine")}>
          {t("novel.outlineGenerator.refineTitle")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void handleBulkIngest()} disabled={bulkIngestRunning || bulkIngesting}>
          {bulkIngestRunning || bulkIngesting ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              {t("novel.outlineGenerator.bulkIngesting")}
            </>
          ) : (
            t("novel.outlineGenerator.bulkIngest")
          )}
        </Button>
      </div>

      <OutlineGeneratorDialog
        open={outlineDialogOpen}
        onOpenChange={setOutlineDialogOpen}
        mode={outlineDialogMode}
      />
      <InspirationDialog
        open={inspirationOpen}
        onOpenChange={setInspirationOpen}
      />
    </>
  )
}
