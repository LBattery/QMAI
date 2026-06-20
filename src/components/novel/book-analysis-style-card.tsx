import { Feather, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { BookAnalysisLibraryBook } from "@/lib/novel/book-analysis/library-state"

interface BookAnalysisStyleCardProps {
  book: BookAnalysisLibraryBook
  extracting: boolean
  onExtractStyle: () => void
  onToggleStyle: () => void
}

export function BookAnalysisStyleCard({ book, extracting, onExtractStyle, onToggleStyle }: BookAnalysisStyleCardProps) {
  const profile = book.styleProfile
  const enabled = book.styleStatus === "enabled"

  return (
    <section className="rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Feather className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">作品文风</h3>
            {enabled && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">已启用</span>
            )}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {profile?.narrativeDensity || "尚未提取叙事文风。作品文风只约束叙事写法，不等同于角色说话方式。"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {profile && (
            <Button size="sm" variant={enabled ? "outline" : "default"} onClick={onToggleStyle}>
              {enabled ? "取消启用" : "启用此文风"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onExtractStyle} disabled={extracting}>
            {extracting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {extracting ? "提取中..." : profile ? "重新提取文风" : "提取文风"}
          </Button>
        </div>
      </div>
      {profile && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-md bg-muted/40 p-3 text-xs">
            <div className="font-medium">描写克制度</div>
            <div className="mt-1 text-muted-foreground">{profile.descriptionWeight || "—"}</div>
          </div>
          <div className="rounded-md bg-muted/40 p-3 text-xs">
            <div className="font-medium">对白风格</div>
            <div className="mt-1 text-muted-foreground">{profile.dialogueStyle || "—"}</div>
          </div>
        </div>
      )}
    </section>
  )
}
