import { create } from "zustand"
import {
  createPlotDiscussionSession,
  summarizePlotDiscussionSession,
  type PlotDiscussionSession,
  type PlotDiscussionSessionSummary,
} from "@/lib/novel/director-room/plot-discussion"
import {
  deletePlotDiscussion,
  loadPlotDiscussion,
  loadPlotDiscussionSummaries,
  savePlotDiscussion,
} from "@/lib/novel/director-room/discussion-store"

export type DirectorRoomWorkspaceMode = "discussion" | "simulation"

interface DirectorRoomState {
  workspaceMode: DirectorRoomWorkspaceMode
  sessions: PlotDiscussionSessionSummary[]
  currentSession: PlotDiscussionSession | null
  loadedProjectPath: string | null
  loadingSessions: boolean
  sessionError: string | null
  setWorkspaceMode: (mode: DirectorRoomWorkspaceMode) => void
  loadProject: (projectPath: string) => Promise<void>
  createSession: (projectPath: string) => Promise<PlotDiscussionSession>
  selectSession: (projectPath: string, id: string) => Promise<void>
  updateSession: (
    projectPath: string,
    updater: (session: PlotDiscussionSession) => PlotDiscussionSession,
  ) => Promise<PlotDiscussionSession | null>
  removeSession: (projectPath: string, id: string) => Promise<void>
  resetProject: () => void
}

function upsertSummary(
  summaries: PlotDiscussionSessionSummary[],
  session: PlotDiscussionSession,
): PlotDiscussionSessionSummary[] {
  const summary = summarizePlotDiscussionSession(session)
  return [summary, ...summaries.filter((item) => item.id !== session.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const useDirectorRoomStore = create<DirectorRoomState>((set, get) => ({
  workspaceMode: "discussion",
  sessions: [],
  currentSession: null,
  loadedProjectPath: null,
  loadingSessions: false,
  sessionError: null,

  setWorkspaceMode: (workspaceMode) => set({ workspaceMode }),

  loadProject: async (projectPath) => {
    if (get().loadedProjectPath === projectPath && get().currentSession) return
    set({ loadingSessions: true, sessionError: null })
    try {
      const summaries = await loadPlotDiscussionSummaries(projectPath)
      if (summaries.length === 0) {
        const session = createPlotDiscussionSession()
        await savePlotDiscussion(projectPath, session)
        set({
          sessions: [summarizePlotDiscussionSession(session)],
          currentSession: session,
          loadedProjectPath: projectPath,
          loadingSessions: false,
        })
        return
      }
      const current = await loadPlotDiscussion(projectPath, summaries[0].id)
      set({
        sessions: summaries,
        currentSession: current,
        loadedProjectPath: projectPath,
        loadingSessions: false,
      })
    } catch (error) {
      set({
        loadingSessions: false,
        sessionError: error instanceof Error ? error.message : String(error),
      })
    }
  },

  createSession: async (projectPath) => {
    const session = createPlotDiscussionSession()
    await savePlotDiscussion(projectPath, session)
    set((state) => ({
      currentSession: session,
      sessions: upsertSummary(state.sessions, session),
      loadedProjectPath: projectPath,
      sessionError: null,
    }))
    return session
  },

  selectSession: async (projectPath, id) => {
    if (get().currentSession?.id === id) return
    set({ loadingSessions: true, sessionError: null })
    try {
      const session = await loadPlotDiscussion(projectPath, id)
      if (!session) throw new Error("讨论记录不存在或已损坏")
      set({ currentSession: session, loadingSessions: false })
    } catch (error) {
      set({
        loadingSessions: false,
        sessionError: error instanceof Error ? error.message : String(error),
      })
    }
  },

  updateSession: async (projectPath, updater) => {
    const current = get().currentSession
    if (!current) return null
    const updated = updater(current)
    set((state) => ({
      currentSession: updated,
      sessions: upsertSummary(state.sessions, updated),
      sessionError: null,
    }))
    try {
      await savePlotDiscussion(projectPath, updated)
      return updated
    } catch (error) {
      set({ sessionError: error instanceof Error ? error.message : String(error) })
      return updated
    }
  },

  removeSession: async (projectPath, id) => {
    await deletePlotDiscussion(projectPath, id)
    const remaining = get().sessions.filter((session) => session.id !== id)
    if (get().currentSession?.id !== id) {
      set({ sessions: remaining })
      return
    }
    if (remaining.length > 0) {
      const next = await loadPlotDiscussion(projectPath, remaining[0].id)
      set({ sessions: remaining, currentSession: next })
      return
    }
    const session = createPlotDiscussionSession()
    await savePlotDiscussion(projectPath, session)
    set({
      sessions: [summarizePlotDiscussionSession(session)],
      currentSession: session,
    })
  },

  resetProject: () => set({
    sessions: [],
    currentSession: null,
    loadedProjectPath: null,
    loadingSessions: false,
    sessionError: null,
  }),
}))

