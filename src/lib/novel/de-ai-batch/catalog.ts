import { extractChapterNumber } from "@/lib/novel/chapter-utils"
import { normalizePath } from "@/lib/path-utils"
import type { FileNode, WikiProject } from "@/types/wiki"

export interface DeAiBatchCatalogChapter {
  id: string
  title: string
  order: number
  sourcePath: string
}

export interface DeAiBatchCatalogWork {
  id: string
  title: string
  chapters: DeAiBatchCatalogChapter[]
}

function flatten(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = []
  for (const node of nodes) {
    if (node.is_dir) result.push(...flatten(node.children ?? []))
    else result.push(node)
  }
  return result
}

function stableSafeId(prefix: string, value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`
}

function withoutExtension(name: string): string {
  return name.replace(/\.md$/i, "")
}

export function buildDeAiBatchCatalog(project: WikiProject, fileTree: FileNode[]): DeAiBatchCatalogWork[] {
  const chapterRoot = `${normalizePath(project.path).replace(/\/$/, "")}/wiki/chapters/`
  const groups = new Map<string, FileNode[]>()
  for (const file of flatten(fileTree)) {
    const path = normalizePath(file.path)
    if (!path.toLowerCase().endsWith(".md") || !path.startsWith(chapterRoot)) continue
    const relative = path.slice(chapterRoot.length)
    const segments = relative.split("/").filter(Boolean)
    if (segments.length === 0) continue
    const groupTitle = segments.length > 1 ? segments[0] : project.name
    const current = groups.get(groupTitle) ?? []
    current.push(file)
    groups.set(groupTitle, current)
  }

  return Array.from(groups.entries())
    .map(([title, files]) => {
      const workId = stableSafeId("work", `${project.id}:${title}`)
      const chapters = files.map((file, index) => {
        const chapterTitle = withoutExtension(file.name)
        return {
          id: stableSafeId("chapter", normalizePath(file.path)),
          title: chapterTitle,
          order: extractChapterNumber(chapterTitle) ?? index + 1,
          sourcePath: normalizePath(file.path),
        }
      }).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh-Hans-CN", { numeric: true }))
      return { id: workId, title, chapters }
    })
    .sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN", { numeric: true }))
}
