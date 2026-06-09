import { parseFrontmatter } from "@/lib/frontmatter"

export function normalizeChapterEditFile(input: {
  content: string
  targetChapterNumber: number
}): { ok: true; content: string } | { ok: false; message: string } {
  const normalized = input.content.replace(/\r\n?/g, "\n").trim()
  const parsed = parseFrontmatter(normalized)
  if (!parsed.frontmatter) {
    return {
      ok: false,
      message: `第${input.targetChapterNumber}章返回内容缺少 frontmatter，已停止写回。`,
    }
  }

  const body = parsed.body.trim()
  if (!body) {
    return {
      ok: false,
      message: `第${input.targetChapterNumber}章返回内容缺少正文，已停止写回。`,
    }
  }

  const titleMatch = body.match(/^#\s+(.+)$/m)
  if (!titleMatch?.[1]?.trim()) {
    return {
      ok: false,
      message: `第${input.targetChapterNumber}章返回内容缺少标题，已停止写回。`,
    }
  }

  const correctedTitle = `第${input.targetChapterNumber}章`
  const frontmatter = {
    ...parsed.frontmatter,
    chapter_number: String(input.targetChapterNumber),
    title: correctedTitle,
  }

  const frontmatterLines = Object.entries(frontmatter).map(([key, value]) => {
    const safeValue = String(value ?? "")
    return key === "title" ? `${key}: "${safeValue.replace(/"/g, '\\"')}"` : `${key}: ${safeValue}`
  })

  const correctedBody = body.replace(/^#\s+.+$/m, `# ${correctedTitle}`)

  return {
    ok: true,
    content: `---\n${frontmatterLines.join("\n")}\n---\n\n${correctedBody}\n`,
  }
}
