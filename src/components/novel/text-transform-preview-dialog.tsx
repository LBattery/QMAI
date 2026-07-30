import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AiChangeComparePanel } from "@/components/common/ai-change-compare-panel"

interface TextTransformPreviewDialogProps {
  open: boolean
  title: string
  description?: string
  sourceLabel: string
  candidateLabel: string
  sourceContent: string
  candidateContent: string
  applyLabel: string
  secondaryActionLabel?: string
  applyDisabled?: boolean
  secondaryActionDisabled?: boolean
  comparisonMode?: boolean
  onCandidateContentChange?: (content: string) => void
  onApply: () => void
  onSecondaryAction?: () => void
  onClose: () => void
}

export function TextTransformPreviewDialog({
  open,
  title,
  description,
  sourceLabel,
  candidateLabel,
  sourceContent,
  candidateContent,
  applyLabel,
  secondaryActionLabel,
  applyDisabled = false,
  secondaryActionDisabled = false,
  comparisonMode = false,
  onCandidateContentChange,
  onApply,
  onSecondaryAction,
  onClose,
}: TextTransformPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className={comparisonMode
        ? "flex h-[min(48rem,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] w-[min(80rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)]"
        : "sm:max-w-3xl"
      }>
        <DialogHeader className={comparisonMode ? "shrink-0 border-b px-4 py-3" : undefined}>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {comparisonMode ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <AiChangeComparePanel
              originalContent={sourceContent}
              modifiedContent={candidateContent}
              originalLabel={sourceLabel}
              modifiedLabel={candidateLabel}
              editable={Boolean(onCandidateContentChange)}
              onModifiedContentChange={onCandidateContentChange ?? (() => {})}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex min-h-0 flex-col gap-2">
              <div className="text-xs font-medium text-muted-foreground">{sourceLabel}</div>
              <div className="max-h-96 overflow-y-auto rounded-md border bg-muted/20 p-3 text-sm leading-6 whitespace-pre-wrap">
                {sourceContent}
              </div>
            </div>
            <div className="flex min-h-0 flex-col gap-2">
              <div className="text-xs font-medium text-muted-foreground">{candidateLabel}</div>
              {onCandidateContentChange ? (
                <Textarea
                  className="min-h-40 max-h-96 resize-y overflow-y-auto bg-muted/20 text-sm leading-6 whitespace-pre-wrap"
                  value={candidateContent}
                  onChange={(event) => onCandidateContentChange(event.target.value)}
                />
              ) : (
                <div className="max-h-96 overflow-y-auto rounded-md border bg-muted/20 p-3 text-sm leading-6 whitespace-pre-wrap">
                  {candidateContent}
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter className={comparisonMode ? "mx-0 mb-0 shrink-0 border-t px-4 py-3" : undefined}>
          <Button variant="outline" onClick={onClose}>取消</Button>
          {secondaryActionLabel && onSecondaryAction ? (
            <Button variant="outline" onClick={onSecondaryAction} disabled={secondaryActionDisabled}>{secondaryActionLabel}</Button>
          ) : null}
          <Button onClick={onApply} disabled={applyDisabled}>{applyLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
