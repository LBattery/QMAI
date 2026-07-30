import { useId, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { NovelGenerationRequestPackage } from "@/lib/novel/novel-generation-request-package"

export function NovelGenerationRequestMessage({ request }: { request: NovelGenerationRequestPackage }) {
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  return (
    <div className="min-w-0 max-w-full">
      <span className="block break-words">{request.summary}</span>
      <button
        type="button"
        className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {expanded ? "收起详情" : "展开详情"}
      </button>
      <div
        id={detailsId}
        data-novel-request-details
        hidden={!expanded}
        className="mt-2 max-h-[min(40vh,20rem)] max-w-full overflow-y-auto overscroll-contain rounded-md border border-border/60 p-2 text-sm"
      >
        {request.details.map((detail) => <div key={detail} className="break-words py-0.5">{detail}</div>)}
      </div>
    </div>
  )
}
