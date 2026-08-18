import { useEffect, useState } from "react"
import { Clock3, Film, Loader2, MessageCircle, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useWikiStore } from "@/stores/wiki-store"
import { useDirectorRoomStore } from "@/stores/director-room-store"
import { useDirectorRoomSimulationStore } from "@/stores/director-room-simulation-store"
import {
  deleteSimulationResult,
  loadFrameworks,
  loadSimulationResults,
} from "@/lib/novel/director-room/framework-store"
import { loadBinding } from "@/lib/novel/director-room/framework-binding"
import type { StoryFramework } from "@/lib/novel/director-room/types"
import { FrameworkList } from "./framework-list"

function DiscussionSidebarPanel() {
  const projectPath = useWikiStore((state) => state.project?.path)
  const sessions = useDirectorRoomStore((state) => state.sessions)
  const currentSession = useDirectorRoomStore((state) => state.currentSession)
  const loading = useDirectorRoomStore((state) => state.loadingSessions)
  const createSession = useDirectorRoomStore((state) => state.createSession)
  const selectSession = useDirectorRoomStore((state) => state.selectSession)
  const removeSession = useDirectorRoomStore((state) => state.removeSession)

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle className="h-4 w-4 text-amber-600" />
          剧情圆桌
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => projectPath && void createSession(projectPath)}
          disabled={!projectPath}
          title="新建讨论"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          新讨论
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading && sessions.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在加载讨论
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-2 py-8 text-center text-xs text-muted-foreground">还没有讨论记录</div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => {
              const active = currentSession?.id === session.id
              return (
                <div key={session.id} className={`group flex items-center gap-1 rounded-md border px-2 py-2 ${active ? "border-amber-500/40 bg-amber-500/[0.08]" : "border-transparent hover:bg-accent"}`}>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => projectPath && void selectSession(projectPath, session.id)}
                  >
                    <div className="truncate text-sm text-foreground">{session.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{session.messageCount} 条发言</span>
                      <span>{session.directionCount} 个方向</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-destructive group-hover:opacity-100"
                    onClick={() => {
                      if (projectPath && window.confirm("删除这条讨论记录？")) void removeSession(projectPath, session.id)
                    }}
                    title="删除讨论"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function SimulationSidebarPanel() {
  const projectPath = useWikiStore((state) => state.project?.path)
  const setFrameworks = useDirectorRoomSimulationStore((state) => state.setFrameworks)
  const setBinding = useDirectorRoomSimulationStore((state) => state.setBinding)
  const setCurrentFramework = useDirectorRoomSimulationStore((state) => state.setCurrentFramework)
  const setCurrentReport = useDirectorRoomSimulationStore((state) => state.setCurrentReport)
  const setCurrentDraft = useDirectorRoomSimulationStore((state) => state.setCurrentDraft)
  const setTimelineEvents = useDirectorRoomSimulationStore((state) => state.setTimelineEvents)
  const setPhase = useDirectorRoomSimulationStore((state) => state.setPhase)
  const setSavedResults = useDirectorRoomSimulationStore((state) => state.setSavedResults)
  const setSelectedResultId = useDirectorRoomSimulationStore((state) => state.setSelectedResultId)
  const currentFramework = useDirectorRoomSimulationStore((state) => state.currentFramework)
  const savedResults = useDirectorRoomSimulationStore((state) => state.savedResults)
  const selectedResultId = useDirectorRoomSimulationStore((state) => state.selectedResultId)
  const reset = useDirectorRoomSimulationStore((state) => state.reset)
  const [loading, setLoading] = useState(false)

  const loadResultsForFramework = async (frameworkId: string) => {
    if (!projectPath) return
    const results = await loadSimulationResults(projectPath, frameworkId).catch(() => [])
    setSavedResults(results.map((result) => ({
      id: result.id,
      frameworkId,
      report: result.report,
      draft: result.draft,
      timelineEvents: result.timelineEvents,
      agentSnapshot: result.agentSnapshot,
      rumors: result.rumors,
      debugTraces: result.debugTraces,
      status: result.status,
      partialReason: result.partialReason,
      resume: result.resume,
      createdAt: result.report.createdAt,
    })))
  }

  useEffect(() => {
    if (!projectPath) return
    let cancelled = false
    setLoading(true)
    void Promise.all([loadFrameworks(projectPath), loadBinding(projectPath)])
      .then(([frameworks, binding]) => {
        if (cancelled) return
        setFrameworks(frameworks)
        setBinding(binding)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [projectPath, setBinding, setFrameworks])

  useEffect(() => {
    if (currentFramework) void loadResultsForFramework(currentFramework.id)
    else setSavedResults([])
  }, [currentFramework, projectPath, setSavedResults])

  const handleNewFramework = () => {
    reset()
    setPhase("configuring")
  }

  const handleSelectFramework = (framework: StoryFramework) => {
    setCurrentFramework(framework)
    setCurrentReport(null)
    setCurrentDraft(null)
    setTimelineEvents([])
    setSelectedResultId(null)
    setPhase("framework-confirming")
  }

  const handleSelectResult = (resultId: string) => {
    const result = savedResults.find((item) => item.id === resultId)
    if (!result) return
    setCurrentReport(result.report)
    setCurrentDraft(result.draft || null)
    setTimelineEvents(result.timelineEvents || [])
    setSelectedResultId(resultId)
    setPhase("report-viewing")
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Film className="h-4 w-4 text-amber-600" />
          沙盘推演
        </div>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleNewFramework}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          新建框架
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />读取框架</div>}
        <FrameworkList onSelectFramework={handleSelectFramework} onNewFramework={handleNewFramework} />
      </div>
      {currentFramework && savedResults.length > 0 && (
        <div className="shrink-0 border-t">
          <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />历史推演 ({savedResults.length})
          </div>
          <div className="max-h-44 overflow-y-auto px-2 pb-2">
            {savedResults.map((result) => (
              <div key={result.id} className={`group flex items-center gap-1 rounded-md ${selectedResultId === result.id ? "bg-accent" : "hover:bg-accent/60"}`}>
                <button type="button" onClick={() => handleSelectResult(result.id)} className="min-w-0 flex-1 px-2 py-1.5 text-left text-xs">
                  <div className="truncate text-foreground">{new Date(result.createdAt).toLocaleString()}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{result.report.recommendation.slice(0, 56)}</div>
                </button>
                <button type="button" className="mr-1 flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-background hover:text-destructive group-hover:opacity-100" title="删除结果" onClick={() => {
                  if (!projectPath || !window.confirm("删除这条推演结果？")) return
                  void deleteSimulationResult(projectPath, currentFramework.id, result.id).then(() => loadResultsForFramework(currentFramework.id))
                }}><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function DirectorRoomSidebarPanel() {
  const mode = useDirectorRoomStore((state) => state.workspaceMode)
  const projectPath = useWikiStore((state) => state.project?.path)
  const loadProject = useDirectorRoomStore((state) => state.loadProject)

  useEffect(() => {
    if (projectPath) void loadProject(projectPath)
  }, [loadProject, projectPath])

  return mode === "discussion" ? <DiscussionSidebarPanel /> : <SimulationSidebarPanel />
}
