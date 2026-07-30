import type { ConversationRunStates } from "@/lib/conversation-run-state"

export function canApplyOutlineRunEffect(
  states: ConversationRunStates,
  conversationId: string,
  runId: string,
): boolean {
  const state = states[conversationId]
  return state?.status === "running" && state.runId === runId
}

export function shouldClearOutlineDraft(input: {
  clearDraft: boolean
  invocationConversationId: string | null
  activeConversationId: string | null
}): boolean {
  return input.clearDraft && input.invocationConversationId === input.activeConversationId
}

export function shouldClearOutlineReferences(input: {
  invocationConversationId: string | null
  activeConversationId: string | null
  sentReferences: ReadonlyArray<{ id: string }>
  currentReferences: ReadonlyArray<{ id: string }>
}): boolean {
  if (input.invocationConversationId !== input.activeConversationId) return false
  if (input.sentReferences.length !== input.currentReferences.length) return false
  const currentIds = new Set(input.currentReferences.map((reference) => reference.id))
  return input.sentReferences.every((reference) => currentIds.has(reference.id))
}

export function setOutlineSessionValue<T>(
  values: Record<string, T>,
  conversationId: string,
  value: T | null,
): Record<string, T> {
  if (value === null) {
    const { [conversationId]: _removed, ...remaining } = values
    return remaining
  }
  return { ...values, [conversationId]: value }
}
