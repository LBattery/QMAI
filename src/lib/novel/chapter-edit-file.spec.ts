import { describe, expect, it } from "vitest"
import { normalizeChapterEditFile } from "./chapter-edit-file"

describe("normalizeChapterEditFile", () => {
  it("forces chapter_number and title to match the target chapter", () => {
    const result = normalizeChapterEditFile({
      targetChapterNumber: 12,
      content: `---
chapter_number: 99
title: "第99章 错位标题"
chapter_status: draft
---

# 第99章 错位标题

这里是正文内容。
`,
    })

    expect(result).toEqual({
      ok: true,
      content: expect.stringContaining('chapter_number: 12'),
    })
    if (result.ok) {
      expect(result.content).toContain('title: "第12章"')
      expect(result.content).toContain('# 第12章')
    }
  })

  it("rejects files without frontmatter", () => {
    const result = normalizeChapterEditFile({
      targetChapterNumber: 12,
      content: `# 第12章\n\n这里只有正文`,
    })

    expect(result).toEqual({
      ok: false,
      message: "第12章返回内容缺少 frontmatter，已停止写回。",
    })
  })

  it("rejects files without a heading title", () => {
    const result = normalizeChapterEditFile({
      targetChapterNumber: 12,
      content: `---
chapter_number: 12
title: "第12章"
---

这里只有正文，没有标题行`,
    })

    expect(result).toEqual({
      ok: false,
      message: "第12章返回内容缺少标题，已停止写回。",
    })
  })
})
