import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, Lightbulb, Copy, Save, StopCircle, RefreshCw, Send, NotebookPen, RotateCcw } from "lucide-react"
import ReactMarkdown from "react-markdown"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { listDirectory, readFile, writeFile, createDirectory, fileExists } from "@/commands/fs"
import { normalizePath } from "@/lib/path-utils"
import { refreshProjectState } from "@/lib/project-refresh"
import { parseFrontmatter } from "@/lib/frontmatter"
import { parseChapterMeta, type ChapterStatus } from "@/lib/novel/chapter-meta"
import { loadSnapshot, type ChapterSnapshot } from "@/lib/novel/chapter-ingest"
import { streamChat, type ChatMessage } from "@/lib/llm-client"
import { hasUsableLlm } from "@/lib/has-usable-llm"
import { resolveNovelModel } from "@/lib/novel/model-resolver"
import { PROMPTS } from "@/lib/novel/prompt-templates"
import { useWikiStore } from "@/stores/wiki-store"
import { useInspirationNotesStore } from "@/stores/inspiration-notes-store"
import type { InspirationNote } from "@/lib/inspiration-notes"
import { cn } from "@/lib/utils"

interface ChapterEntry {
  path: string
  title: string
  chapterNumber?: number
  chapterStatus?: ChapterStatus
}

interface OutlineEntry {
  path: string
  title: string
}

interface InspirationMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

type Stage = "config" | "chat" | "done"

function excerptText(text: string, maxLength = 1600): string {
  const normalized = text.trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, 800).trimEnd()}\n\n[正文中段已省略]\n\n${normalized.slice(-700).trimStart()}`
}

function formatSnapshotMemory(snapshot: ChapterSnapshot, fallbackTitle: string): string {
  const list = (title: string, items: string[] | undefined) =>
    items && items.length > 0 ? [`### ${title}`, ...items.map((item) => `- ${item}`)].join("\n") : ""
  return [
    `## 第${snapshot.chapterNumber}章：${snapshot.chapterTitle ?? fallbackTitle}`,
    snapshot.summary ? `### 摘要\n${snapshot.summary}` : "",
    list("关键事件", snapshot.events),
    list("角色外貌、衣着和当前状态", snapshot.characterAppearanceAndStatus),
    list("人物状态变化", snapshot.characterStateChanges),
    list("角色认知变化", snapshot.knowledgeChanges),
    list("伏笔变化", snapshot.foreshadowingChanges),
    list("冲突", snapshot.conflicts),
    list("时间线事件", snapshot.timelineEvents),
    snapshot.endingHook ? `### 结尾钩子\n${snapshot.endingHook}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

async function loadChapterList(projectPath: string): Promise<ChapterEntry[]> {
  try {
    const tree = await listDirectory(`${projectPath}/wiki/chapters`)
    const flattenFiles = (nodes: typeof tree): typeof tree => {
      const files: typeof tree = []
      for (const node of nodes) {
        if (node.is_dir && node.children) files.push(...flattenFiles(node.children))
        else if (!node.is_dir && node.name.endsWith(".md")) files.push(node)
      }
      return files
    }
    const allFiles = flattenFiles(tree)
    const entries = await Promise.all(
      allFiles.map(async (file): Promise<ChapterEntry> => {
        const title = file.name.replace(/\.md$/, "").replace(/-/g, " ")
        try {
          const content = await readFile(file.path)
          const parsed = parseFrontmatter(content)
          const meta = parsed.frontmatter ? parseChapterMeta(parsed.frontmatter as Record<string, unknown>) : null
          return {
            path: file.path,
            title,
            chapterNumber: meta?.chapterNumber ?? extractChapterNumber(file.name),
            chapterStatus: meta?.status,
          }
        } catch {
          return { path: file.path, title, chapterNumber: extractChapterNumber(file.name) }
        }
      }),
    )
    entries.sort(compareChapters)
    return entries.slice(-15)
  } catch {
    /* chapters dir may not exist */
    return []
  }
}

function extractChapterNumber(name: string): number | undefined {
  const normalized = name.replace(/\.md$/i, "")
  const matches = Array.from(normalized.matchAll(/\d+/g))
  if (matches.length === 0) return undefined
  const parsed = Number(matches[matches.length - 1][0])
  return Number.isFinite(parsed) ? parsed : undefined
}

function compareChapters(a: ChapterEntry, b: ChapterEntry): number {
  if (a.chapterNumber !== undefined && b.chapterNumber !== undefined && a.chapterNumber !== b.chapterNumber) {
    return a.chapterNumber - b.chapterNumber
  }
  if (a.chapterNumber !== undefined && b.chapterNumber === undefined) return 1
  if (a.chapterNumber === undefined && b.chapterNumber !== undefined) return -1
  return a.title.localeCompare(b.title, "zh-CN", { numeric: true, sensitivity: "base" })
}

async function loadOutlineList(projectPath: string): Promise<OutlineEntry[]> {
  const entries: OutlineEntry[] = []
  try {
    const outlinesDir = `${normalizePath(projectPath)}/wiki/outlines`
    const tree = await listDirectory(outlinesDir)
    const flattenFiles = (nodes: typeof tree): typeof tree => {
      const files: typeof tree = []
      for (const node of nodes) {
        if (node.is_dir && node.children) files.push(...flattenFiles(node.children))
        else if (!node.is_dir && node.name.endsWith(".md")) files.push(node)
      }
      return files
    }
    const allFiles = flattenFiles(tree)
    allFiles.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
    for (const file of allFiles) {
      entries.push({ path: file.path, title: file.name.replace(/\.md$/, "").replace(/-/g, " ") })
    }
  } catch {
    /* outlines dir may not exist */
  }
  return entries
}

async function buildChapterMemory(projectPath: string, selected: Set<string>, chapters: ChapterEntry[]): Promise<string> {
  const selectedEntries = chapters.filter((file) => selected.has(file.path))
  const chunks = await Promise.all(
    selectedEntries.map(async (file) => {
      try {
        const content = await readFile(file.path)
        const parsed = parseFrontmatter(content)
        const meta = parsed.frontmatter ? parseChapterMeta(parsed.frontmatter as Record<string, unknown>) : null
        const snapshot = meta ? await loadSnapshot(projectPath, meta.chapterNumber) : null
        if (snapshot) return formatSnapshotMemory(snapshot, file.title)
        return [`## ${file.title}`, "### 章节记忆", "未找到结构化记忆快照，以下为章节正文片段：", "", excerptText(parsed.body || content)].join("\n")
      } catch {
        return `## ${file.title}\n### 章节记忆\n读取失败`
      }
    }),
  )
  return chunks.join("\n\n---\n\n")
}

function formatNoteTitle(note: InspirationNote): string {
  const d = new Date(note.updatedAt || note.createdAt)
  const date = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  return `${date} ${time}`
}

function previewText(text: string, maxLength = 72): string {
  const trimmed = text.trim().replace(/\s+/g, " ")
  if (!trimmed) return ""
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed
}

async function buildReferenceContext(
  selectedOutlines: Set<string>,
  outlines: OutlineEntry[],
  selectedNotes: Set<string>,
  notes: InspirationNote[],
): Promise<string> {
  const sections: string[] = []

  const outlineSections: string[] = []
  for (const file of outlines.filter((item) => selectedOutlines.has(item.path))) {
    try {
      const content = await readFile(file.path)
      const trimmed = content.length > 2400 ? `${content.slice(0, 2400)}\n...(已截断)` : content
      outlineSections.push(`【${file.title}】\n${trimmed}`)
    } catch {
      /* skip unreadable outline */
    }
  }
  if (outlineSections.length > 0) sections.push(["## 已选大纲", ...outlineSections].join("\n\n"))

  const noteSections = notes
    .filter((note) => selectedNotes.has(note.id) && note.content.trim())
    .map((note) => {
      const content = excerptText(note.content, 1200)
      return `【${formatNoteTitle(note)}】\n${content}`
    })
  if (noteSections.length > 0) sections.push(["## 已选灵感记录", ...noteSections].join("\n\n"))

  return sections.join("\n\n")
}

interface InspirationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InspirationDialog({ open, onOpenChange }: InspirationDialogProps) {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const llmConfig = useWikiStore((s) => s.llmConfig)
  const novelConfig = useWikiStore((s) => s.novelConfig)
  const addNote = useInspirationNotesStore((s) => s.addNote)
  const setNotesPanelOpen = useInspirationNotesStore((s) => s.setPanelOpen)
  const notes = useInspirationNotesStore((s) => s.notes)
  const loadNotesFromDisk = useInspirationNotesStore((s) => s.loadFromDisk)

  const [chapters, setChapters] = useState<ChapterEntry[]>([])
  const [outlines, setOutlines] = useState<OutlineEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectedOutlines, setSelectedOutlines] = useState<Set<string>>(new Set())
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set())
  const [messages, setMessages] = useState<InspirationMessage[]>([])
  const [streamingContent, setStreamingContent] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [stage, setStage] = useState<Stage>("config")
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Load selectable context when the dialog opens.
  useEffect(() => {
    if (!open || !project) {
      setChapters([])
      setOutlines([])
      return
    }
    let cancelled = false
    Promise.all([loadChapterList(project.path), loadOutlineList(project.path), loadNotesFromDisk()])
      .then(([chapterEntries, outlineEntries]) => {
        if (!cancelled) {
          setChapters(chapterEntries)
          setOutlines(outlineEntries)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChapters([])
          setOutlines([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [loadNotesFromDisk, open, project])

  // Abort any in-flight stream on close.
  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [open])

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    const container = scrollRef.current
    if (container) container.scrollTop = container.scrollHeight
  }, [messages, streamingContent])

  const effectiveLlmConfig = useMemo(
    () => resolveNovelModel(llmConfig, novelConfig, "writing"),
    [llmConfig, novelConfig],
  )

  const resetSession = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setMessages([])
    setStreamingContent("")
    setIsStreaming(false)
    setStage("config")
    setInput("")
    setError(null)
    setSaveMsg(null)
  }, [])

  const runStream = useCallback(
    async (chatMessages: ChatMessage[], onDone: (full: string) => void) => {
      if (!project) return
      const controller = new AbortController()
      abortRef.current = controller
      setIsStreaming(true)
      setError(null)
      let result = ""
      try {
        await streamChat(
          effectiveLlmConfig,
          chatMessages,
          {
            onToken: (token) => {
              result += token
              setStreamingContent(result)
            },
            onDone: () => {},
            onError: (err) => {
              throw err
            },
          },
          controller.signal,
        )
        onDone(result)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!/aborted/i.test(message)) {
          setError(t("novel.inspiration.error", { message }))
        }
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [effectiveLlmConfig, project, t],
  )

  const handleStart = useCallback(async () => {
    if (!project || isStreaming) return
    if (!hasUsableLlm(effectiveLlmConfig)) {
      setError(t("novel.inspiration.needLlm"))
      return
    }
    const [chapterMemory, outlineContext] = await Promise.all([
      buildChapterMemory(project.path, selected, chapters),
      buildReferenceContext(selectedOutlines, outlines, selectedNotes, notes),
    ])
    const system = PROMPTS.inspirationCoachSystem(chapterMemory, outlineContext)
    const seed: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: "请开始第一轮剧情引导。" },
    ]
    setStage("chat")
    setMessages([{ id: crypto.randomUUID(), role: "user", content: "请开始第一轮剧情引导。" }])
    await runStream(seed, (full) => {
      if (full.trim()) {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: full.trim() }])
      }
      setStreamingContent("")
    })
  }, [chapters, effectiveLlmConfig, isStreaming, notes, outlines, project, runStream, selected, selectedNotes, selectedOutlines, t])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming || stage !== "chat") return
    const userMsg: InspirationMessage = { id: crypto.randomUUID(), role: "user", content: text }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput("")
    const history: ChatMessage[] = [
      // System is rebuilt from project context on each call so the
      // model keeps the grounding fresh across long sessions.
      ...(await (async () => {
        if (!project) return [] as ChatMessage[]
        const [chapterMemory, outlineContext] = await Promise.all([
          buildChapterMemory(project.path, selected, chapters),
          buildReferenceContext(selectedOutlines, outlines, selectedNotes, notes),
        ])
        return [{ role: "system", content: PROMPTS.inspirationCoachSystem(chapterMemory, outlineContext) }] as ChatMessage[]
      })()),
      ...nextMessages.map((m) => ({ role: m.role, content: m.content })),
    ]
    await runStream(history, (full) => {
      if (full.trim()) {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: full.trim() }])
      }
      setStreamingContent("")
    })
  }, [chapters, input, isStreaming, messages, notes, outlines, project, runStream, selected, selectedNotes, selectedOutlines, stage])

  const synthesizeFrom = useCallback(
    async (baseMessages: InspirationMessage[]) => {
      if (!project) return
      const userMsg: InspirationMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: PROMPTS.inspirationSynthesizeUser(),
      }
      const nextMessages = [...baseMessages, userMsg]
      setMessages(nextMessages)
      const [chapterMemory, outlineContext] = await Promise.all([
        buildChapterMemory(project.path, selected, chapters),
        buildReferenceContext(selectedOutlines, outlines, selectedNotes, notes),
      ])
      const history: ChatMessage[] = [
        { role: "system", content: PROMPTS.inspirationCoachSystem(chapterMemory, outlineContext) },
        ...nextMessages.map((m) => ({ role: m.role, content: m.content })),
      ]
      await runStream(history, (full) => {
        if (full.trim()) {
          setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: full.trim() }])
        }
        setStreamingContent("")
        setStage("done")
      })
    },
    [chapters, notes, outlines, project, runStream, selected, selectedNotes, selectedOutlines],
  )

  const handleSynthesize = useCallback(async () => {
    if (isStreaming || messages.length === 0) return
    await synthesizeFrom(messages)
  }, [isStreaming, messages, synthesizeFrom])

  // Drop the previous result and the synthesize instruction that produced
  // it, then re-run synthesis. The LLM is non-deterministic, so this yields
  // a fresh take on the same conversation.
  const handleRegenerate = useCallback(async () => {
    if (isStreaming || messages.length === 0) return
    const trimmed = [...messages]
    while (trimmed.length > 0 && trimmed[trimmed.length - 1].role === "assistant") {
      trimmed.pop()
    }
    const synthesizeInstruction = PROMPTS.inspirationSynthesizeUser()
    if (
      trimmed.length > 0 &&
      trimmed[trimmed.length - 1].role === "user" &&
      trimmed[trimmed.length - 1].content === synthesizeInstruction
    ) {
      trimmed.pop()
    }
    if (trimmed.length === 0) return
    setMessages(trimmed)
    setStreamingContent("")
    setStage("chat")
    await synthesizeFrom(trimmed)
  }, [isStreaming, messages, synthesizeFrom])

  const handleStop = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
  }, [])

  const handleCopy = useCallback(async () => {
    const last = [...messages].reverse().find((m) => m.role === "assistant")
    if (!last) return
    try {
      await navigator.clipboard.writeText(last.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }, [messages])

  const handleSaveAsOutline = useCallback(async () => {
    if (!project) return
    const last = [...messages].reverse().find((m) => m.role === "assistant")
    if (!last) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const pp = normalizePath(project.path)
      const outlinesDir = `${pp}/wiki/outlines`
      if (!(await fileExists(outlinesDir))) {
        await createDirectory(outlinesDir)
      }
      const stamp = new Date()
        .toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
        .replace(/[\/\s:]/g, "-")
      const path = `${outlinesDir}/续写灵感-${stamp}.md`
      await writeFile(path, `# 续写灵感\n\n${last.content}`)
      await refreshProjectState(project.path)
      setSaveMsg(t("novel.inspiration.saved"))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSaveMsg(t("novel.inspiration.saveFailed", { message }))
    } finally {
      setSaving(false)
    }
  }, [messages, project, t])

  const handleSaveToNotes = useCallback(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant")
    if (!last) return
    addNote(last.content)
    setSaveMsg(t("novel.inspiration.savedToNotes"))
    setNotesPanelOpen(true)
    onOpenChange(false)
  }, [messages, addNote, setNotesPanelOpen, onOpenChange])

  const lastAssistant = useMemo(() => [...messages].reverse().find((m) => m.role === "assistant"), [messages])
  const hasResult = stage === "done" && lastAssistant != null

  function toggleChapter(path: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function selectRecentChapters(count: number) {
    const selectable = chapters.filter((file) => file.chapterStatus !== "outline")
    setSelected(new Set(selectable.slice(-count).map((file) => file.path)))
  }

  function toggleOutline(path: string) {
    setSelectedOutlines((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function toggleNote(id: string) {
    setSelectedNotes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            {t("novel.inspiration.dialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("novel.inspiration.dialogDescription")}</DialogDescription>
        </DialogHeader>

        {stage === "config" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>{t("novel.inspiration.selectChapters")}</Label>
                {chapters.length > 0 ? (
                  <Button size="sm" variant="outline" onClick={() => selectRecentChapters(10)}>
                    {t("novel.inspiration.selectRecentTen")}
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">{t("novel.inspiration.selectChaptersHint")}</p>
              {chapters.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("novel.inspiration.noChapters")}</p>
              ) : (
                <div className="max-h-64 overflow-y-auto rounded-md border p-2">
                  {chapters.map((file) => {
                    const checked = selected.has(file.path)
                    return (
                      <label key={file.path} className="flex cursor-pointer items-center gap-2 px-1 py-1 text-sm hover:bg-accent/40 rounded">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleChapter(file.path)}
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="truncate">{file.title}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("novel.inspiration.selectReferences")}</Label>
              <p className="text-xs text-muted-foreground">{t("novel.inspiration.selectReferencesHint")}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="min-h-0 rounded-md border p-2">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">{t("novel.inspiration.outlineReferences")}</div>
                  {outlines.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("novel.inspiration.noOutlineReferences")}</p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto">
                      {outlines.map((file) => {
                        const checked = selectedOutlines.has(file.path)
                        return (
                          <label key={file.path} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent/40">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleOutline(file.path)}
                              className="h-4 w-4 accent-primary"
                            />
                            <span className="truncate">{file.title}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="min-h-0 rounded-md border p-2">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">{t("novel.inspiration.noteReferences")}</div>
                  {notes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("novel.inspiration.noNoteReferences")}</p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto">
                      {notes.map((note) => {
                        const checked = selectedNotes.has(note.id)
                        return (
                          <label key={note.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm hover:bg-accent/40">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleNote(note.id)}
                              className="mt-0.5 h-4 w-4 accent-primary"
                            />
                            <span className="min-w-0">
                              <span className="block text-xs text-muted-foreground">{formatNoteTitle(note)}</span>
                              <span className="block truncate">{previewText(note.content) || t("novel.inspiration.blankReference")}</span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("novel.inspiration.startHint")}</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md border bg-muted/20 p-3 text-sm">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border",
                    )}
                  >
                    {m.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {isStreaming && streamingContent ? (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-lg border bg-background px-3 py-2">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{streamingContent}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ) : null}
              {isStreaming && !streamingContent ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("novel.inspiration.generating")}
                </div>
              ) : null}
            </div>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {saveMsg ? <p className="text-xs text-muted-foreground">{saveMsg}</p> : null}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {stage === "config" ? (
            <div className="flex w-full justify-end gap-2">
              <Button size="sm" onClick={() => void handleStart()} disabled={isStreaming}>
                {isStreaming ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Lightbulb className="mr-1 h-4 w-4" />}
                {t("novel.inspiration.start")}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex w-full items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t("novel.inspiration.inputPlaceholder")}
                  rows={2}
                  disabled={isStreaming || stage === "done"}
                  className="min-h-[44px] flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      void handleSend()
                    }
                  }}
                />
                {isStreaming ? (
                  <Button size="sm" variant="outline" onClick={handleStop}>
                    <StopCircle className="mr-1 h-4 w-4" />
                    {t("novel.inspiration.stop")}
                  </Button>
                ) : stage === "chat" ? (
                  <Button size="sm" onClick={() => void handleSend()} disabled={!input.trim()}>
                    <Send className="mr-1 h-4 w-4" />
                    {t("novel.inspiration.send")}
                  </Button>
                ) : null}
              </div>
              <div className="flex w-full flex-wrap justify-between gap-2">
                <Button size="sm" variant="ghost" onClick={resetSession} disabled={isStreaming}>
                  <RefreshCw className="mr-1 h-4 w-4" />
                  {t("novel.inspiration.newSession")}
                </Button>
                <div className="flex flex-wrap gap-2">
                  {hasResult ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => void handleRegenerate()} disabled={isStreaming}>
                        {isStreaming ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1 h-4 w-4" />}
                        {t("novel.inspiration.regenerate")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void handleCopy()} disabled={saving}>
                        <Copy className="mr-1 h-4 w-4" />
                        {copied ? t("novel.inspiration.copied") : t("novel.inspiration.copy")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void handleSaveAsOutline()} disabled={saving}>
                        {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                        {saving ? t("novel.inspiration.saving") : t("novel.inspiration.saveAsOutline")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleSaveToNotes}>
                        <NotebookPen className="mr-1 h-4 w-4" />
                        {t("novel.inspiration.saveToNotes")}
                      </Button>
                    </>
                  ) : null}
                  {stage === "chat" && !isStreaming ? (
                    <Button size="sm" onClick={() => void handleSynthesize()}>
                      <Lightbulb className="mr-1 h-4 w-4" />
                      {t("novel.inspiration.synthesize")}
                    </Button>
                  ) : null}
                  {stage === "done" && isStreaming ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t("novel.inspiration.synthesizing")}
                    </span>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
