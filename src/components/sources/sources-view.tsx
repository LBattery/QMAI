import { Suspense, lazy, useState } from "react"
import { useTranslation } from "react-i18next"
import { useWikiStore } from "@/stores/wiki-store"
import { useInspirationNotesStore } from "@/stores/inspiration-notes-store"
import { OutlineActionToolbar } from "@/components/sources/outline-action-toolbar"
import { OutlineWorkbench } from "@/components/sources/outline-workbench"
import { PreviewPanel } from "@/components/layout/preview-panel"

const InspirationNotesPanel = lazy(async () => {
  const mod = await import("@/components/sources/inspiration-notes-panel")
  return { default: mod.InspirationNotesPanel }
})

export function SourcesView() {
  const { t } = useTranslation()
  const novelMode = useWikiStore((s) => s.novelMode)
  const notesPanelOpen = useInspirationNotesStore((s) => s.panelOpen)
  const setNotesPanelOpen = useInspirationNotesStore((s) => s.setPanelOpen)
  const [bulkIngestResult, setBulkIngestResult] = useState<string | null>(null)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">
          {t(novelMode ? "novel.sources.title" : "sources.title")}
        </h2>
        <div className="flex flex-wrap gap-1">
          {novelMode ? (
            <OutlineActionToolbar onBulkIngestResult={setBulkIngestResult} />
          ) : null}
        </div>
      </div>

      {bulkIngestResult ? (
        <div className="whitespace-pre-line border-b px-4 py-2 text-xs text-muted-foreground">
          {bulkIngestResult}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {novelMode ? (
          <div className="flex h-full min-h-0 overflow-hidden">
            <div className="min-w-0 flex-1 overflow-hidden">
              <OutlineWorkbench />
            </div>
            {notesPanelOpen ? (
              <aside className="w-[360px] shrink-0 overflow-hidden border-l bg-background">
                <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading...</div>}>
                  <InspirationNotesPanel onClose={() => setNotesPanelOpen(false)} />
                </Suspense>
              </aside>
            ) : null}
          </div>
        ) : (
          <PreviewPanel />
        )}
      </div>
    </div>
  )
}
