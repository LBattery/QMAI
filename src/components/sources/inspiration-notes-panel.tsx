import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Trash2, X, Search, Save, Plus } from "lucide-react"
import { useInspirationNotesStore } from "@/stores/inspiration-notes-store"
import { Textarea } from "@/components/ui/textarea"
import { useWikiStore } from "@/stores/wiki-store"
import { cn } from "@/lib/utils"

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const date = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  return `${date} ${time}`
}

function preview(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return ""
  const firstLine = trimmed.split("\n")[0]
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine
}

export function InspirationNotesPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const notes = useInspirationNotesStore((s) => s.notes)
  const loadFromDisk = useInspirationNotesStore((s) => s.loadFromDisk)
  const addNote = useInspirationNotesStore((s) => s.addNote)
  const updateNote = useInspirationNotesStore((s) => s.updateNote)
  const deleteNote = useInspirationNotesStore((s) => s.deleteNote)

  // Always-on composer for capturing a new inspiration. After saving it
  // clears and stays focused, so the next idea can be typed right away —
  // no need to click "+" between notes.
  const [composer, setComposer] = useState("")
  const [search, setSearch] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const composerRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!project) {
      setEditingId(null)
      setEditDraft("")
      return
    }
    // Reload notes whenever the active project changes (the store is
    // project-scoped, persisted to <project>/.qmai/inspiration-notes.json).
    void loadFromDisk()
  }, [project?.path, loadFromDisk])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return notes
    return notes.filter((n) => n.content.toLowerCase().includes(q))
  }, [notes, search])

  function commitComposer() {
    const trimmed = composer.trim()
    if (!trimmed) return
    addNote(trimmed)
    setComposer("")
    // Refocus so the next inspiration can be typed immediately — this is
    // the "auto open a new one" behavior.
    composerRef.current?.focus()
  }

  function startEdit(id: string, content: string) {
    setEditingId(id)
    setEditDraft(content)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft("")
  }

  function commitEdit(id: string) {
    const trimmed = editDraft.trim()
    const existing = notes.find((n) => n.id === id)
    if (existing && existing.content !== trimmed) {
      updateNote(id, trimmed)
    }
    cancelEdit()
  }

  return (
    <div className="flex h-full flex-col border-border bg-background">
      {/* Header */}
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <span className="shrink-0 px-1 text-xs font-medium text-foreground">{t("novel.inspirationNotes.title")}</span>
        <button
          onClick={() => composerRef.current?.focus()}
          className="shrink-0 rounded px-1.5 py-1 text-muted-foreground hover:bg-accent"
          title={t("novel.inspirationNotes.new")}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <div className="relative ml-auto flex items-center">
          <Search className="pointer-events-none absolute left-1.5 h-3 w-3 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("novel.inspirationNotes.searchPlaceholder")}
            className="h-6 w-32 rounded border border-input bg-background pl-6 pr-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <button onClick={onClose} className="ml-1 rounded p-1 text-muted-foreground hover:bg-accent" title={t("novel.inspirationNotes.close")}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Always-on composer */}
      <div className="border-b p-2">
        <textarea
          ref={composerRef}
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          rows={3}
          autoFocus
          placeholder={t("novel.inspirationNotes.composerPlaceholder")}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              commitComposer()
            } else if (e.key === "Escape") {
              e.preventDefault()
              setComposer("")
            }
          }}
        />
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{t("novel.inspirationNotes.composerHint")}</span>
          <button
            onClick={commitComposer}
            disabled={!composer.trim()}
            className="rounded border border-border px-1.5 py-0.5 text-xs hover:bg-accent disabled:opacity-40"
            title={t("novel.inspirationNotes.save")}
          >
            <Save className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
            {search.trim()
              ? t("novel.inspirationNotes.emptySearch")
              : t("novel.inspirationNotes.empty")}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((note) => {
              const isEditing = editingId === note.id
              return (
                <li
                  key={note.id}
                  className={cn(
                    "group rounded-md border bg-background px-2 py-1.5 text-sm",
                    isEditing ? "border-ring" : "border-border hover:bg-accent/30",
                  )}
                >
                  {isEditing ? (
                    <div className="flex flex-col gap-1.5">
                      <Textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={5}
                        autoFocus
                        placeholder={t("novel.inspirationNotes.editPlaceholder")}
                        className="text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault()
                            commitEdit(note.id)
                          } else if (e.key === "Escape") {
                            e.preventDefault()
                            cancelEdit()
                          }
                        }}
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">{t("novel.inspirationNotes.editHint")}</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => commitEdit(note.id)}
                            className="rounded border border-border px-1.5 py-0.5 text-xs hover:bg-accent"
                            title={t("novel.inspirationNotes.save")}
                          >
                            <Save className="h-3 w-3" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded border border-border px-1.5 py-0.5 text-xs hover:bg-accent"
                            title={t("novel.inspirationNotes.cancel")}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-1">
                      <button
                        onClick={() => startEdit(note.id, note.content)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="text-[10px] text-muted-foreground">
                          {formatTimestamp(note.updatedAt || note.createdAt)}
                        </div>
                        <div className="whitespace-pre-wrap break-words text-sm text-foreground">
                          {preview(note.content) || t("novel.inspirationNotes.blankNote")}
                        </div>
                      </button>
                      <button
                        onClick={() => deleteNote(note.id)}
                        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                        title={t("novel.inspirationNotes.delete")}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
