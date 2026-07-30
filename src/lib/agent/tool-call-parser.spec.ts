import { describe, expect, it } from "vitest"
import { accumulateToolCalls, parseTextToolCalls } from "./tool-call-parser"
import type { ToolCallDelta } from "./types"

describe("accumulateToolCalls", () => {
  it("accumulates streaming deltas into complete tool calls", () => {
    const deltas: ToolCallDelta[] = [
      { index: 0, id: "call_1" },
      { index: 0, name: "read_chapter" },
      { index: 0, arguments: '{"name"' },
      { index: 0, arguments: ':"第1章"}' },
    ]
    const result = accumulateToolCalls(deltas)
    expect(result).toEqual([
      {
        id: "call_1",
        type: "function",
        function: {
          name: "read_chapter",
          arguments: '{"name":"第1章"}',
        },
      },
    ])
  })

  it("handles multiple tool calls in sequence", () => {
    const deltas: ToolCallDelta[] = [
      { index: 0, id: "call_1", name: "read_chapter" },
      { index: 0, arguments: '{"name":"第1章"}' },
      { index: 1, id: "call_2", name: "read_memory" },
      { index: 1, arguments: '{"name":"曙光"}' },
    ]
    const result = accumulateToolCalls(deltas)
    expect(result).toHaveLength(2)
    expect(result[0].function.arguments).toEqual('{"name":"第1章"}')
    expect(result[1].function.arguments).toEqual('{"name":"曙光"}')
  })

  it("handles empty deltas", () => {
    expect(accumulateToolCalls([])).toEqual([])
  })

  it("preserves malformed JSON in arguments", () => {
    const deltas: ToolCallDelta[] = [
      { index: 0, id: "call_1" },
      { index: 0, arguments: "not json" },
    ]
    const result = accumulateToolCalls(deltas)
    expect(result[0].function.arguments).toBe("not json")
  })
})

describe("parseTextToolCalls", () => {
  const allowed = new Set(["read_chapter", "route_task"])

  it("parses name/arguments JSON", () => {
    const result = parseTextToolCalls(
      '{"name":"read_chapter","arguments":{"name":"第1章"}}',
      allowed,
    )
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].function.name).toBe("read_chapter")
    expect(result.toolCalls[0].function.arguments).toBe('{"name":"第1章"}')
    expect(result.residualText).toBe("")
  })

  it("parses fenced JSON and keeps residual prose", () => {
    const result = parseTextToolCalls(
      '先查一下章节。\n```json\n{"name":"read_chapter","parameters":{"name":"第1章"}}\n```\n',
      allowed,
    )
    expect(result.toolCalls[0].function.name).toBe("read_chapter")
    expect(result.residualText).toContain("先查一下章节")
  })

  it("parses OpenAI-shaped tool_calls wrapper", () => {
    const result = parseTextToolCalls(
      JSON.stringify({
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "route_task", arguments: '{"intent":"write_chapter"}' },
          },
        ],
      }),
      allowed,
    )
    expect(result.toolCalls[0].id).toBe("call_1")
    expect(result.toolCalls[0].function.name).toBe("route_task")
  })

  it("ignores JSON that is not an allowed tool", () => {
    const result = parseTextToolCalls('{"name":"unknown_tool","arguments":{}}', allowed)
    expect(result.toolCalls).toEqual([])
    expect(result.residualText).toContain("unknown_tool")
  })
})
