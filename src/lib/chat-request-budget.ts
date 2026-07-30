import type { ChatMessage, ContentBlock } from "./llm-providers"

const HISTORY_TRUNCATED_MARKER = "[history truncated]\n"
const CONTENT_TRUNCATED_MARKER = "\n[内容已压缩，保留首尾]\n"

function contentLength(content: ChatMessage["content"]): number {
  if (typeof content === "string") return content.length
  return content.reduce((sum, block) => {
    if (block.type === "text") return sum + block.text.length
    return sum + block.dataBase64.length
  }, 0)
}

function messageLength(message: ChatMessage): number {
  const toolArgumentsLength = message.tool_calls?.reduce(
    (sum, call) => sum + call.function.arguments.length,
    0,
  ) ?? 0
  return contentLength(message.content) + toolArgumentsLength
}

function totalLength(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + messageLength(message), 0)
}

function clampTail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  if (maxChars <= HISTORY_TRUNCATED_MARKER.length) {
    return HISTORY_TRUNCATED_MARKER.slice(0, maxChars)
  }
  return HISTORY_TRUNCATED_MARKER + text.slice(-(maxChars - HISTORY_TRUNCATED_MARKER.length))
}

function clampHeadTail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  if (maxChars <= CONTENT_TRUNCATED_MARKER.length) return text.slice(0, maxChars)
  const available = maxChars - CONTENT_TRUNCATED_MARKER.length
  const head = Math.ceil(available * 0.55)
  const tail = Math.max(0, available - head)
  return `${text.slice(0, head)}${CONTENT_TRUNCATED_MARKER}${tail > 0 ? text.slice(-tail) : ""}`
}

function trimContent(content: ChatMessage["content"], maxChars: number, preserveHead = false): ChatMessage["content"] {
  if (typeof content === "string") return preserveHead ? clampHeadTail(content, maxChars) : clampTail(content, maxChars)

  let remaining = maxChars
  const reversed: ContentBlock[] = []
  for (let i = content.length - 1; i >= 0; i -= 1) {
    const block = content[i]
    if (!block) continue
    if (block.type !== "text") {
      const len = block.dataBase64.length
      if (len <= remaining) {
        reversed.push(block)
        remaining -= len
      }
      continue
    }

    const text = preserveHead ? clampHeadTail(block.text, remaining) : clampTail(block.text, remaining)
    if (text.length > 0) {
      reversed.push({ ...block, text })
      remaining -= text.length
    }
    if (remaining <= 0) break
  }

  return reversed.reverse()
}

function isLeadingSystemMessage(messages: ChatMessage[], index: number): boolean {
  return messages[index]?.role === "system" && messages.slice(0, index).every((message) => message.role === "system")
}

function trimMessage(message: ChatMessage, maxChars: number, preserveHead = false): ChatMessage {
  const toolArgumentsLength = message.tool_calls?.reduce(
    (sum, call) => sum + call.function.arguments.length,
    0,
  ) ?? 0
  const contentBudget = Math.max(0, maxChars - toolArgumentsLength)
  const content = trimContent(message.content, contentBudget, preserveHead)
  let remainingArguments = Math.max(0, maxChars - contentLength(content))
  const toolCalls = message.tool_calls?.map((call) => {
    const argumentsValue = call.function.arguments
    if (argumentsValue.length <= remainingArguments) {
      remainingArguments -= argumentsValue.length
      return call
    }
    const compactedArguments = remainingArguments >= 2 ? "{}" : argumentsValue.slice(0, remainingArguments)
    remainingArguments = Math.max(0, remainingArguments - compactedArguments.length)
    return {
      ...call,
      function: { ...call.function, arguments: compactedArguments },
    }
  })
  return {
    ...message,
    content,
    ...(toolCalls ? { tool_calls: toolCalls } : {}),
  }
}

function groupHistory(messages: ChatMessage[]): ChatMessage[][] {
  const groups: ChatMessage[][] = []
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!
    if (message.role === "assistant" && message.tool_calls?.length) {
      const callIds = new Set(message.tool_calls.map((call) => call.id))
      const group = [message]
      while (index + 1 < messages.length) {
        const next = messages[index + 1]!
        if (next.role !== "tool" || !next.tool_call_id || !callIds.has(next.tool_call_id)) break
        group.push(next)
        index += 1
      }
      groups.push(group)
      continue
    }
    groups.push([message])
  }
  return groups
}

/**
 * Trims packed chat messages by character budget before sending them to an LLM.
 * The current user request is preserved because it carries the user's latest intent.
 */
export function trimChatMessagesToBudget(messages: ChatMessage[], maxChars: number): ChatMessage[] {
  if (messages.length === 0) return messages
  if (!Number.isFinite(maxChars) || maxChars <= 0) return messages
  if (totalLength(messages) <= maxChars) return messages

  const leadingSystems: ChatMessage[] = []
  let firstNonSystem = 0
  while (firstNonSystem < messages.length - 1 && messages[firstNonSystem]?.role === "system") {
    leadingSystems.push(messages[firstNonSystem]!)
    firstNonSystem += 1
  }
  const bodyGroups = groupHistory(messages.slice(firstNonSystem))
  let latestUserGroup = -1
  for (let index = bodyGroups.length - 1; index >= 0; index -= 1) {
    if (bodyGroups[index]!.some((message) => message.role === "user")) {
      latestUserGroup = index
      break
    }
  }
  const retainedGroups = bodyGroups.map((group, index) => ({
    group,
    protected: index === latestUserGroup || index === bodyGroups.length - 1,
  }))
  let next = [...leadingSystems, ...retainedGroups.flatMap((entry) => entry.group)]

  while (totalLength(next) > maxChars) {
    const removableIndex = retainedGroups.findIndex((entry) => !entry.protected)
    if (removableIndex < 0) break
    const removableCount = retainedGroups.filter((entry) => !entry.protected).length
    const removableGroup = retainedGroups[removableIndex]!.group
    const containsToolProtocol = removableGroup.some(
      (message) => message.role === "tool" || Boolean(message.tool_calls?.length),
    )
    if (removableCount === 1 && !containsToolProtocol) break
    retainedGroups.splice(removableIndex, 1)
    next = [...leadingSystems, ...retainedGroups.flatMap((entry) => entry.group)]
  }

  if (totalLength(next) <= maxChars) return next

  let latestUserIndex = -1
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index]?.role === "user") {
      latestUserIndex = index
      break
    }
  }
  if (latestUserIndex < 0) latestUserIndex = next.length - 1

  for (let i = 0; i < next.length && totalLength(next) > maxChars; i += 1) {
    if (i === latestUserIndex || isLeadingSystemMessage(next, i) || next[i]?.role === "system") continue
    const excess = totalLength(next) - maxChars
    const current = next[i]
    if (!current) continue
    const targetLength = Math.max(0, messageLength(current) - excess)
    next[i] = trimMessage(current, targetLength)
  }

  if (totalLength(next) <= maxChars) return next

  for (let i = 0; i < next.length && totalLength(next) > maxChars; i += 1) {
    if (i === latestUserIndex) continue
    const current = next[i]
    if (!current) continue
    const excess = totalLength(next) - maxChars
    const targetLength = Math.max(0, messageLength(current) - excess)
    next[i] = trimMessage(current, targetLength)
  }

  if (totalLength(next) <= maxChars) return next

  const excess = totalLength(next) - maxChars
  next[latestUserIndex] = trimMessage(
    next[latestUserIndex]!,
    Math.max(0, messageLength(next[latestUserIndex]!) - excess),
    true,
  )
  return next
}
