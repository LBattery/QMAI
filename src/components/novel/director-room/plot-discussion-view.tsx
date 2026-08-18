import { useEffect, useMemo, useRef, useState } from "react"
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Flame,
  Lightbulb,
  Loader2,
  Pin,
  RefreshCw,
  Reply,
  Send,
  Shuffle,
  Square,
  User,
  Users,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useWikiStore } from "@/stores/wiki-store"
import { useDirectorRoomStore } from "@/stores/director-room-store"
import { resolveDefaultModel } from "@/lib/novel/model-resolver"
import { extractStoryContent } from "@/lib/novel/director-room/story-extractor"
import {
  responseToDirections,
  responseToMessages,
  runPlotDiscussion,
  type PlotDirection,
  type PlotDiscussionFocus,
  type PlotDiscussionMessage,
  type PlotDiscussionSession,
} from "@/lib/novel/director-room/plot-discussion"
import { exportPlotDiscussion } from "@/lib/novel/director-room/discussion-store"

const FOCUS_OPTIONS: Array<{
  value: PlotDiscussionFocus
  label: string
  icon: typeof Lightbulb
}> = [
  { value: "open", label: "自由发散", icon: Lightbulb },
  { value: "character", label: "角色主导", icon: Users },
  { value: "reverse", label: "反驳直觉", icon: Shuffle },
  { value: "pressure", label: "矛盾加压", icon: Flame },
]

const QUICK_PROMPTS = [
  "如果顺着人物欲望走，下一步最可能失控在哪里？",
  "现在谁最可能做出让我意外、但又完全合理的选择？",
  "先别推进主线，聊聊哪段关系最值得发生一点变化。",
]

function nextMessageId(): string {
  return `message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function messageStyle(message: PlotDiscussionMessage): {
  avatar: string
  bubble: string
  icon: typeof Bot
} {
  if (message.speakerType === "user") {
    return {
      avatar: "bg-foreground text-background",
      bubble: "border-foreground/15 bg-foreground/[0.04]",
      icon: User,
    }
  }
  if (message.speakerType === "character") {
    return {
      avatar: "bg-cyan-600 text-white dark:bg-cyan-500 dark:text-cyan-950",
      bubble: "border-cyan-500/20 bg-cyan-500/[0.06]",
      icon: Users,
    }
  }
  return {
    avatar: "bg-amber-500 text-amber-950",
    bubble: "border-amber-500/20 bg-amber-500/[0.07]",
    icon: Bot,
  }
}

function DiscussionMessage({ message }: { message: PlotDiscussionMessage }) {
  const style = messageStyle(message)
  const Icon = style.icon
  return (
    <div className="flex gap-3 px-5 py-3">
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${style.avatar}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className={`min-w-0 flex-1 rounded-md border px-4 py-3 ${style.bubble}`}>
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-semibold text-foreground">{message.speakerName}</span>
          {message.replyToSpeakerName ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Reply className="h-3 w-3" />
              回应 {message.replyToSpeakerName}
            </span>
          ) : null}
        </div>
        <div className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">
          {message.content}
        </div>
      </div>
    </div>
  )
}

function DirectionItem({
  direction,
  onTogglePin,
  onDiscuss,
  onRemove,
}: {
  direction: PlotDirection
  onTogglePin: () => void
  onDiscuss: () => void
  onRemove: () => void
}) {
  return (
    <div className={`rounded-md border p-3 ${direction.pinned ? "border-amber-500/50 bg-amber-500/[0.08]" : "bg-background"}`}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onDiscuss}
          title="带入下一轮讨论"
        >
          <div className="text-sm font-semibold text-foreground">{direction.title}</div>
          <div className="mt-1.5 text-xs leading-5 text-muted-foreground">{direction.possibility}</div>
        </button>
        <button
          type="button"
          onClick={onTogglePin}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent ${direction.pinned ? "text-amber-600" : "text-muted-foreground"}`}
          title={direction.pinned ? "取消保留" : "保留方向"}
        >
          {direction.pinned ? <Check className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="移除方向"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {direction.spark ? (
        <div className="mt-2 border-l-2 border-cyan-500/40 pl-2 text-xs leading-5 text-foreground/80">
          {direction.spark}
        </div>
      ) : null}
      {direction.tradeoff ? (
        <div className="mt-2 text-[11px] leading-4 text-muted-foreground">代价：{direction.tradeoff}</div>
      ) : null}
    </div>
  )
}

export function PlotDiscussionView() {
  const projectPath = useWikiStore((state) => state.project?.path)
  const baseLlmConfig = useWikiStore((state) => state.llmConfig)
  const currentSession = useDirectorRoomStore((state) => state.currentSession)
  const loadProject = useDirectorRoomStore((state) => state.loadProject)
  const updateSession = useDirectorRoomStore((state) => state.updateSession)
  const sessionError = useDirectorRoomStore((state) => state.sessionError)

  const [input, setInput] = useState("")
  const [focus, setFocus] = useState<PlotDiscussionFocus>("open")
  const [workingLabel, setWorkingLabel] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [exportedPath, setExportedPath] = useState<string | null>(null)
  const [rolesCollapsed, setRolesCollapsed] = useState(false)
  const [directionsCollapsed, setDirectionsCollapsed] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const messageListRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (projectPath) void loadProject(projectPath)
  }, [loadProject, projectPath])

  useEffect(() => {
    const messageList = messageListRef.current
    if (!messageList) return
    messageList.scrollTo({ top: messageList.scrollHeight, behavior: "smooth" })
  }, [currentSession?.messages.length, workingLabel])

  useEffect(() => () => abortRef.current?.abort(), [])

  const characters = currentSession?.context?.characters ?? []
  const selectedCharacters = useMemo(() => {
    const selectedIds = new Set(currentSession?.selectedCharacterIds ?? [])
    return characters.filter((character) => selectedIds.has(character.id))
  }, [characters, currentSession?.selectedCharacterIds])

  const refreshContext = async (
    session: PlotDiscussionSession,
  ): Promise<PlotDiscussionSession> => {
    if (!projectPath) throw new Error("请先打开小说项目")
    setWorkingLabel("正在读取近期故事与角色...")
    const extraction = await extractStoryContent(projectPath, {
      sourceChapters: session.sourceChapters,
      llmConfig: resolveDefaultModel(baseLlmConfig),
      onProgress: (_progress, label) => setWorkingLabel(label),
    })
    const existingSelected = new Set(session.selectedCharacterIds)
    const availableIds = new Set(extraction.characters.map((character) => character.id))
    const retained = [...existingSelected].filter((id) => availableIds.has(id))
    const selectedCharacterIds = retained.length > 0
      ? retained
      : extraction.characters.slice(0, 4).map((character) => character.id)
    const updated = await updateSession(projectPath, (current) => ({
      ...current,
      context: extraction,
      selectedCharacterIds,
      updatedAt: new Date().toISOString(),
    }))
    if (!updated) throw new Error("无法保存讨论上下文")
    return updated
  }

  const handleRefreshContext = async () => {
    if (!currentSession) return
    setLocalError(null)
    try {
      await refreshContext(currentSession)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    } finally {
      setWorkingLabel(null)
    }
  }

  const handleSend = async (
    promptOverride?: string,
    focusOverride?: PlotDiscussionFocus,
  ) => {
    const prompt = (promptOverride ?? input).trim()
    if (!prompt || !projectPath || !currentSession || workingLabel) return
    setInput("")
    setLocalError(null)
    setExportedPath(null)
    const controller = new AbortController()
    abortRef.current = controller
    let discussionSession = currentSession
    try {
      if (!discussionSession.context) {
        discussionSession = await refreshContext(discussionSession)
      }
      const now = new Date().toISOString()
      const userMessage: PlotDiscussionMessage = {
        id: nextMessageId(),
        speakerType: "user",
        speakerName: "我",
        content: prompt,
        createdAt: now,
      }
      const updated = await updateSession(projectPath, (session) => ({
        ...session,
        title: session.title === "未命名讨论" ? prompt.slice(0, 24) : session.title,
        messages: [...session.messages, userMessage],
        updatedAt: now,
      }))
      if (!updated) throw new Error("讨论会话尚未准备好")
      discussionSession = updated
      setWorkingLabel("导演与角色正在交换意见...")
      const response = await runPlotDiscussion({
        llmConfig: resolveDefaultModel(baseLlmConfig),
        session: discussionSession,
        prompt,
        focus: focusOverride ?? focus,
        signal: controller.signal,
      })
      const responseMessages = responseToMessages(response)
      const responseDirections = responseToDirections(response)
      await updateSession(projectPath, (session) => {
        if (session.id !== discussionSession.id) return session
        return {
          ...session,
          messages: [...session.messages, ...responseMessages],
          directions: [...responseDirections, ...session.directions].slice(0, 40),
          updatedAt: new Date().toISOString(),
        }
      })
    } catch (error) {
      if (!controller.signal.aborted) {
        setLocalError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setWorkingLabel(null)
    }
  }

  const updateCurrent = (
    updater: (session: PlotDiscussionSession) => PlotDiscussionSession,
  ) => {
    if (!projectPath) return
    void updateSession(projectPath, updater)
  }

  const handleToggleCharacter = (characterId: string) => {
    updateCurrent((session) => {
      const selected = new Set(session.selectedCharacterIds)
      if (selected.has(characterId)) selected.delete(characterId)
      else selected.add(characterId)
      return {
        ...session,
        selectedCharacterIds: [...selected],
        updatedAt: new Date().toISOString(),
      }
    })
  }

  const handleExport = async () => {
    if (!projectPath || !currentSession) return
    setLocalError(null)
    try {
      const path = await exportPlotDiscussion(projectPath, currentSession)
      setExportedPath(path)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    }
  }

  if (!projectPath) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">请先打开小说项目</div>
  }

  if (!currentSession) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在打开导演室...
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b px-5 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{currentSession.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {currentSession.context
                  ? `近期 ${currentSession.sourceChapters} 章 · ${characters.length} 个角色 · ${selectedCharacters.length} 人参会`
                  : "故事上下文尚未读取"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={handleRefreshContext} disabled={Boolean(workingLabel)} title="重新读取故事上下文">
                <RefreshCw className={`h-4 w-4 ${workingLabel?.includes("读取") ? "animate-spin" : ""}`} />
              </Button>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={handleExport} title="导出讨论笔记">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div
            ref={messageListRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2 [scrollbar-gutter:stable]"
          >
            {currentSession.messages.map((message) => (
              <DiscussionMessage key={message.id} message={message} />
            ))}
            {workingLabel ? (
              <div className="flex items-center gap-3 px-5 py-4 text-sm text-muted-foreground">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-500 text-amber-950">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                {workingLabel}
              </div>
            ) : null}
          </div>

          <div className="max-h-[48%] shrink-0 overflow-y-auto border-t bg-background px-5 py-3 [scrollbar-gutter:stable]">
            {currentSession.messages.length <= 1 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void handleSend(prompt)}
                    className="rounded-md border px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/25 hover:bg-accent hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mb-2 flex flex-wrap items-center gap-1">
              {FOCUS_OPTIONS.map((option) => {
                const Icon = option.icon
                const active = focus === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFocus(option.value)}
                    className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors ${active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {option.label}
                  </button>
                )
              })}
            </div>
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    void handleSend()
                  }
                }}
                placeholder="抛一个念头，或直接问某个角色..."
                className="min-h-20 resize-none"
                disabled={Boolean(workingLabel)}
              />
              {workingLabel ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-10 w-10 shrink-0"
                  onClick={() => abortRef.current?.abort()}
                  title="停止"
                >
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => void handleSend()}
                  disabled={!input.trim()}
                  title="发送"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
            {localError || sessionError ? (
              <div className="mt-2 text-xs text-destructive">{localError || sessionError}</div>
            ) : null}
            {exportedPath ? (
              <div className="mt-2 truncate text-xs text-muted-foreground">已导出到 {exportedPath}</div>
            ) : null}
          </div>
        </section>

        <aside className={`flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-t bg-muted/20 lg:h-auto lg:w-80 lg:border-l lg:border-t-0 ${rolesCollapsed && directionsCollapsed ? "h-auto" : "h-[46%]"}`}>
          <div className="shrink-0 border-b">
            <div className="flex min-h-11 items-center justify-between gap-2 px-3 py-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-sm font-semibold transition-colors hover:bg-accent"
                onClick={() => setRolesCollapsed((collapsed) => !collapsed)}
                aria-expanded={!rolesCollapsed}
                title={rolesCollapsed ? "展开参会角色" : "收起参会角色"}
              >
                {rolesCollapsed ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <Users className="h-4 w-4 shrink-0 text-cyan-600" />
                <span className="truncate">参会角色</span>
                <span className="shrink-0 text-xs font-normal text-muted-foreground">
                  {selectedCharacters.length}/{characters.length}
                </span>
              </button>
              {!rolesCollapsed ? (
                <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  近期
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={currentSession.sourceChapters}
                    onChange={(event) => {
                      const value = Math.max(1, Math.min(50, Number(event.target.value) || 1))
                      updateCurrent((session) => ({
                        ...session,
                        sourceChapters: value,
                        updatedAt: new Date().toISOString(),
                      }))
                    }}
                    className="h-7 w-14 px-2 text-center text-xs"
                  />
                  章
                </div>
              ) : null}
            </div>
            {!rolesCollapsed ? (
              <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto px-4 pb-3 [scrollbar-gutter:stable]">
                {characters.length > 0 ? characters.map((character) => {
                  const selected = currentSession.selectedCharacterIds.includes(character.id)
                  return (
                    <button
                      key={character.id}
                      type="button"
                      onClick={() => handleToggleCharacter(character.id)}
                      className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors ${selected ? "border-cyan-500/50 bg-cyan-500/10 text-foreground" : "text-muted-foreground hover:bg-accent"}`}
                    >
                      <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${selected ? "border-cyan-600 bg-cyan-600 text-white" : "border-muted-foreground/40"}`}>
                        {selected ? <Check className="h-2.5 w-2.5" /> : null}
                      </span>
                      {character.name}
                    </button>
                  )
                }) : (
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={handleRefreshContext} disabled={Boolean(workingLabel)}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    读取近期故事
                  </Button>
                )}
              </div>
            ) : null}
          </div>

          <div className={`flex min-h-0 flex-col ${directionsCollapsed ? "shrink-0" : "flex-1"}`}>
            <button
              type="button"
              className="flex min-h-11 shrink-0 items-center justify-between gap-2 px-4 py-2 text-left transition-colors hover:bg-accent"
              onClick={() => setDirectionsCollapsed((collapsed) => !collapsed)}
              aria-expanded={!directionsCollapsed}
              title={directionsCollapsed ? "展开灵感方向" : "收起灵感方向"}
            >
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                {directionsCollapsed ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <Lightbulb className="h-4 w-4 shrink-0 text-amber-600" />
                <span className="truncate">灵感方向</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{currentSession.directions.length}</span>
            </button>
            {!directionsCollapsed ? (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3 [scrollbar-gutter:stable]">
                {currentSession.directions.length > 0 ? currentSession.directions.map((direction) => (
                  <DirectionItem
                    key={direction.id}
                    direction={direction}
                    onTogglePin={() => updateCurrent((session) => ({
                      ...session,
                      directions: session.directions.map((item) => item.id === direction.id ? { ...item, pinned: !item.pinned } : item),
                      updatedAt: new Date().toISOString(),
                    }))}
                    onDiscuss={() => setInput(`我们沿着「${direction.title}」继续聊，但先不要定案：${direction.possibility}`)}
                    onRemove={() => updateCurrent((session) => ({
                      ...session,
                      directions: session.directions.filter((item) => item.id !== direction.id),
                      updatedAt: new Date().toISOString(),
                    }))}
                  />
                )) : (
                  <div className="px-1 py-8 text-center text-xs text-muted-foreground">暂无灵感方向</div>
                )}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
  )
}
