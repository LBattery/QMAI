import { useEffect, useState } from "react"
import { TextTransformPreviewDialog } from "./text-transform-preview-dialog"

export interface DeAiPreviewDialogProps {
  open: boolean
  sourceContent: string
  candidateContent: string
  skillName?: string
  modelName?: string
  onApply: (candidateContent?: string) => void
  onSaveDraft: (candidateContent?: string) => void
  onClose: () => void
}

export function DeAiPreviewDialog({
  open,
  sourceContent,
  candidateContent,
  skillName,
  modelName,
  onApply,
  onSaveDraft,
  onClose,
}: DeAiPreviewDialogProps) {
  const [draftContent, setDraftContent] = useState(candidateContent)

  useEffect(() => {
    if (open) setDraftContent(candidateContent)
  }, [candidateContent, open])

  return (
    <TextTransformPreviewDialog
      open={open}
      title={"去AI味预览"}
      description={skillName
        ? `本次使用 Skill：${skillName}${modelName ? `，模型：${modelName}` : ""}`
        : undefined}
      sourceLabel={"原文"}
      candidateLabel={"去AI味稿"}
      sourceContent={sourceContent}
      candidateContent={draftContent}
      comparisonMode
      onCandidateContentChange={setDraftContent}
      applyLabel={"替换正文"}
      secondaryActionLabel={"另存草稿"}
      onApply={() => onApply(draftContent)}
      onSecondaryAction={() => onSaveDraft(draftContent)}
      onClose={onClose}
    />
  )
}
