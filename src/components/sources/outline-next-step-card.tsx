import { useRef, useState } from "react"

import type { NextStepRecommendation } from "@/lib/novel/outline-next-step"

interface NextStepCardProps {
  recommendation: NextStepRecommendation
  onSelectRecommendation: (recId: string, label: string) => Promise<boolean>
  disabled?: boolean
  disabledReason?: string
}

export function NextStepCard({
  recommendation,
  onSelectRecommendation,
  disabled = false,
  disabledReason,
}: NextStepCardProps) {
  const [busyRecommendationId, setBusyRecommendationId] = useState<string | null>(null)
  const sendingRef = useRef(false)
  if (!recommendation.recommendations || recommendation.recommendations.length === 0) return null

  const selectRecommendation = async (recId: string, label: string) => {
    if (disabled || sendingRef.current) return
    sendingRef.current = true
    setBusyRecommendationId(recId)
    try {
      await onSelectRecommendation(recId, label)
    } finally {
      sendingRef.current = false
      setBusyRecommendationId(null)
    }
  }

  return (
    <div className="mt-3 rounded-md border border-sky-500/30 bg-sky-50/30 p-3 dark:bg-sky-950/10">
      <div className="text-sm font-medium mb-2">接下来想做什么？</div>
      <div className="space-y-2">
        {recommendation.recommendations.map((rec) => {
          const busy = busyRecommendationId === rec.id
          return (
            <button
              key={rec.id}
              type="button"
              className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-accent transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void selectRecommendation(rec.id, rec.label)}
              disabled={disabled || busyRecommendationId !== null}
              title={disabled ? disabledReason : undefined}
              aria-busy={busy || undefined}
            >
              <div className="font-medium">{rec.label}</div>
              {rec.reason ? (
                <div className="text-xs text-muted-foreground">{rec.reason}</div>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
