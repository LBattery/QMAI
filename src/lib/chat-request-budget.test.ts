import { describe, expect, it } from "vitest"
import type { ChatMessage } from "./llm-client"
import { trimChatMessagesToBudget } from "./chat-request-budget"

function text(length: number, char = "x"): string {
  return char.repeat(length)
}

function totalTextLength(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => {
    if (typeof message.content === "string") return sum + message.content.length
    return sum + message.content.reduce((inner, block) => inner + (block.type === "text" ? block.text.length : 0), 0)
  }, 0)
}

describe("trimChatMessagesToBudget", () => {
  it("keeps the system prompt and latest user request while dropping oldest long history first", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: text(1_000, "s") },
      { role: "user", content: "write chapter 39" },
      { role: "assistant", content: text(5_000, "a") },
      { role: "user", content: "write chapter 40" },
      { role: "assistant", content: text(5_000, "b") },
      { role: "user", content: "continue next chapter" },
    ]

    const trimmed = trimChatMessagesToBudget(messages, 6_200)

    expect(trimmed[0]).toBe(messages[0])
    expect(trimmed[trimmed.length - 1]).toBe(messages[messages.length - 1])
    expect(totalTextLength(trimmed)).toBeLessThanOrEqual(6_200)
    expect(trimmed).not.toContain(messages[1])
    expect(trimmed).not.toContain(messages[2])
    expect(trimmed).toContain(messages[4])
  })

  it("truncates oversized assistant history instead of dropping the current request", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: text(500, "s") },
      { role: "assistant", content: text(10_000, "a") },
      { role: "user", content: "continue next chapter" },
    ]

    const trimmed = trimChatMessagesToBudget(messages, 2_000)

    expect(trimmed[0]).toBe(messages[0])
    expect(trimmed[trimmed.length - 1]).toBe(messages[messages.length - 1])
    expect(totalTextLength(trimmed)).toBeLessThanOrEqual(2_000)
    expect(String(trimmed[1]?.content)).toContain("[history truncated]")
  })

  it("hard-caps an oversized current user request while preserving its head and tail", () => {
    const current = `任务目标：续写正文。${text(8_000, "中")}结尾限制：不要改变人物关系。`
    const trimmed = trimChatMessagesToBudget([
      { role: "system", content: text(500, "s") },
      { role: "user", content: current },
    ], 2_000)

    expect(totalTextLength(trimmed)).toBeLessThanOrEqual(2_000)
    expect(String(trimmed.at(-1)?.content)).toContain("任务目标")
    expect(String(trimmed.at(-1)?.content)).toContain("不要改变人物关系")
    expect(String(trimmed.at(-1)?.content)).toContain("内容已压缩")
  })

  it("drops assistant tool call and its tool results as one group", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: text(200, "s") },
      { role: "assistant", content: "", tool_calls: [{ id: "call-1", type: "function", function: { name: "read", arguments: "{}" } }] },
      { role: "tool", content: text(4_000, "t"), tool_call_id: "call-1", name: "read" },
      { role: "user", content: "继续完成任务" },
    ]

    const trimmed = trimChatMessagesToBudget(messages, 800)

    expect(trimmed.some((message) => message.tool_call_id === "call-1")).toBe(false)
    expect(trimmed.some((message) => message.tool_calls?.some((call) => call.id === "call-1"))).toBe(false)
    expect(trimmed.at(-1)?.content).toBe("继续完成任务")
  })

  it("keeps the latest assistant tool call paired with a trailing tool result", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: text(200, "s") },
      { role: "user", content: "分析当前章节" },
      { role: "assistant", content: "", tool_calls: [{ id: "call-latest", type: "function", function: { name: "read", arguments: "{}" } }] },
      { role: "tool", content: text(4_000, "t"), tool_call_id: "call-latest", name: "read" },
    ]

    const trimmed = trimChatMessagesToBudget(messages, 800)

    expect(trimmed.some((message) => message.tool_calls?.some((call) => call.id === "call-latest"))).toBe(true)
    expect(trimmed.some((message) => message.tool_call_id === "call-latest")).toBe(true)
    expect(trimmed.some((message) => message.role === "user" && message.content === "分析当前章节")).toBe(true)
    expect(totalTextLength(trimmed)).toBeLessThanOrEqual(800)
  })

  it("counts large tool-call arguments when removing old tool protocol groups", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: text(100, "s") },
      { role: "user", content: "旧任务" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{
          id: "call-old",
          type: "function",
          function: { name: "write", arguments: JSON.stringify({ content: text(3_000, "a") }) },
        }],
      },
      { role: "tool", content: "写入完成", tool_call_id: "call-old", name: "write" },
      { role: "user", content: "现在只回答新的问题" },
    ]

    const trimmed = trimChatMessagesToBudget(messages, 500)

    expect(trimmed.some((message) => message.tool_calls?.some((call) => call.id === "call-old"))).toBe(false)
    expect(trimmed.some((message) => message.tool_call_id === "call-old")).toBe(false)
    expect(trimmed.at(-1)?.content).toBe("现在只回答新的问题")
  })
})
