import { listDirectory, readFile } from "@/commands/fs"
import { parseFrontmatter } from "@/lib/frontmatter"
import { normalizePath } from "@/lib/path-utils"
import type { FileNode } from "@/types/wiki"

export interface OutlineListEntry {
  /** 相对 outlines 根目录的路径，含 .md */
  relativePath: string
  absolutePath: string
  type?: string
  outlineType?: string
}

function stripMarkdownExt(name: string): string {
  return name.replace(/\.md$/i, "")
}

function scalarFrontmatterString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return undefined
}

export function extractOutlineTypeFields(content: string): {
  type?: string
  outlineType?: string
} {
  const { frontmatter } = parseFrontmatter(content)
  if (!frontmatter) return {}
  return {
    type: scalarFrontmatterString(frontmatter.type),
    outlineType: scalarFrontmatterString(frontmatter.outline_type),
  }
}

async function collectOutlineMarkdownFiles(
  rootDir: string,
  depth = 0,
  maxDepth = 4,
): Promise<Array<{ name: string; path: string }>> {
  let entries: FileNode[] = []
  try {
    entries = await listDirectory(rootDir)
  } catch {
    return []
  }

  const files: Array<{ name: string; path: string }> = []
  for (const entry of entries) {
    if (!entry.is_dir) {
      if (entry.name.toLowerCase().endsWith(".md")) {
        files.push({ name: entry.name, path: entry.path })
      }
      continue
    }
    if (depth >= maxDepth) continue
    files.push(...(await collectOutlineMarkdownFiles(entry.path, depth + 1, maxDepth)))
  }
  return files
}

function toRelativePath(outlinesDir: string, absolutePath: string): string {
  const root = normalizePath(outlinesDir).replace(/\/$/, "")
  const full = normalizePath(absolutePath)
  if (full === root) return ""
  if (full.startsWith(`${root}/`)) return full.slice(root.length + 1)
  return full.split("/").pop() ?? full
}

export function formatOutlineListLine(entry: OutlineListEntry, index: number): string {
  const parts = [`${index + 1}. ${entry.relativePath}`]
  if (entry.type) parts.push(`type=${entry.type}`)
  if (entry.outlineType) parts.push(`outline_type=${entry.outlineType}`)
  return parts.join("  ")
}

const FRONTMATTER_READ_CHARS = 8192

export async function listOutlineEntries(
  outlinesDir: string,
  readTextFile: (path: string) => Promise<string> = readFile,
): Promise<OutlineListEntry[]> {
  const files = await collectOutlineMarkdownFiles(outlinesDir)
  const entries: OutlineListEntry[] = []

  for (const file of files) {
    const relativePath = toRelativePath(outlinesDir, file.path) || file.name
    let type: string | undefined
    let outlineType: string | undefined
    try {
      const content = await readTextFile(file.path)
      // 只需 frontmatter；大卷纲全文可达数百 KB，避免 list 时整文件读入。
      const fields = extractOutlineTypeFields(content.slice(0, FRONTMATTER_READ_CHARS))
      type = fields.type
      outlineType = fields.outlineType
    } catch {
      // 单个文件读失败仍列入清单
    }
    entries.push({
      relativePath,
      absolutePath: file.path,
      type,
      outlineType,
    })
  }

  entries.sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, "zh-Hans-CN", { numeric: true }),
  )
  return entries
}

export function buildOutlineListToolResult(
  entries: OutlineListEntry[],
  targetChapterNumber?: number,
): string {
  if (entries.length === 0) {
    return "可用大纲列表:\n（空）"
  }

  const lines = [
    "可用大纲列表:",
    ...entries.map((entry, index) => formatOutlineListLine(entry, index)),
    "",
    "说明：请根据 frontmatter 的 type / outline_type 分流。",
    "- overview：优先当索引读，用来发现规则与卷纲入口。",
    "- concept：全书硬约束/机制，写正文前关注并读取相关项；不要用章号匹配。",
    "- outline：读正文判断是否对目标章；同为 outline 也可能不是卷纲。",
    "不要只凭文件名选择；不要跳过 overview/concept 只读一份卷纲。",
  ]

  if (typeof targetChapterNumber === "number" && targetChapterNumber > 0) {
    lines.push(
      `本次目标章号：第 ${targetChapterNumber} 章。请结合 overview/concept 约束，为该章找到正文内容对应的大纲。`,
    )
  }

  return lines.join("\n")
}

/** 供测试与调用方：从文件名推导展示名（无扩展名） */
export function outlineDisplayName(relativePath: string): string {
  return stripMarkdownExt(relativePath.split("/").pop() ?? relativePath)
}
