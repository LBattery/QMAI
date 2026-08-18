import { Film, Lightbulb } from "lucide-react"

import { useDirectorRoomStore } from "@/stores/director-room-store"
import { PlotDiscussionView } from "./plot-discussion-view"
import { DirectorRoomSimulationView } from "./story-simulation-view"

export function DirectorRoomView() {
  const workspaceMode = useDirectorRoomStore((state) => state.workspaceMode)
  const setWorkspaceMode = useDirectorRoomStore((state) => state.setWorkspaceMode)

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b px-5 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500 text-amber-950">
            <Film className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">导演室</h1>
            <div className="truncate text-xs text-muted-foreground">
              {workspaceMode === "discussion" ? "剧情圆桌" : "沙盘推演"}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center rounded-md border bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => setWorkspaceMode("discussion")}
            className={`flex h-8 items-center gap-1.5 rounded px-2.5 text-xs transition-colors ${workspaceMode === "discussion" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            title="和 AI 与角色自由讨论后续剧情"
          >
            <Lightbulb className="h-3.5 w-3.5" />
            剧情圆桌
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceMode("simulation")}
            className={`flex h-8 items-center gap-1.5 rounded px-2.5 text-xs transition-colors ${workspaceMode === "simulation" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            title="使用完整的剧情推演沙盘"
          >
            <Film className="h-3.5 w-3.5" />
            沙盘推演
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        {workspaceMode === "discussion" ? <PlotDiscussionView /> : <DirectorRoomSimulationView />}
      </div>
    </div>
  )
}
