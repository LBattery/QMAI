import { describe, expect, it } from "vitest"
import {
  buildOutlineListToolResult,
  extractOutlineTypeFields,
  formatOutlineListLine,
  type OutlineListEntry,
} from "./outline-list-helpers"

describe("outline-list-helpers", () => {
  it("extracts type and outline_type from frontmatter", () => {
    expect(
      extractOutlineTypeFields(`---
type: outline
title: "第三卷大纲"
---

正文`),
    ).toEqual({ type: "outline", outlineType: undefined })

    expect(
      extractOutlineTypeFields(`---
type: concept
outline_type: volume-outline
title: "规则"
---
`),
    ).toEqual({ type: "concept", outlineType: "volume-outline" })

    expect(extractOutlineTypeFields("# 无 frontmatter")).toEqual({})
  })

  it("formats list lines with type fields", () => {
    const entry: OutlineListEntry = {
      relativePath: "卷纲/第三卷.md",
      absolutePath: "/p/wiki/outlines/卷纲/第三卷.md",
      type: "outline",
      outlineType: "volume-outline",
    }
    expect(formatOutlineListLine(entry, 0)).toBe(
      "1. 卷纲/第三卷.md  type=outline  outline_type=volume-outline",
    )
  })

  it("builds tool result with mixed types and optional target chapter", () => {
    const result = buildOutlineListToolResult(
      [
        {
          relativePath: "第三卷大纲.md",
          absolutePath: "/o/第三卷大纲.md",
          type: "outline",
        },
        {
          relativePath: "全局设定.md",
          absolutePath: "/o/全局设定.md",
          type: "overview",
        },
        {
          relativePath: "钢铁洪流系统规则.md",
          absolutePath: "/o/钢铁洪流系统规则.md",
          type: "concept",
        },
      ],
      167,
    )

    expect(result).toContain("1. 第三卷大纲.md  type=outline")
    expect(result).toContain("2. 全局设定.md  type=overview")
    expect(result).toContain("3. 钢铁洪流系统规则.md  type=concept")
    expect(result).toContain("本次目标章号：第 167 章")
    expect(result).toContain("overview：优先当索引读")
    expect(result).toContain("concept：全书硬约束")
    expect(result).toContain("不要跳过 overview/concept")
  })
})
