import { listDirectory, readFile } from "@/commands/fs"
import type { NovelTaskIntent } from "./task-router"

export function extractChapterNumber(text: string): number | null {
  const m = text.match(/第\s*(\d+)\s*[章节回]/)
  if (m?.[1]) return Number.parseInt(m[1], 10)
  const n = text.match(/(\d+)/)
  if (n?.[1]) return Number.parseInt(n[1], 10)
  return null
}

export function flattenMdFiles(nodes: Array<{ name: string; path: string; is_dir: boolean; children?: any[] }>): Array<{ name: string; path: string }> {
  const out: Array<{ name: string; path: string }> = []
  for (const node of nodes) {
    if (node.is_dir) {
      if (node.children) out.push(...flattenMdFiles(node.children))
      continue
    }
    if (node.name.endsWith(".md")) {
      out.push({ name: node.name, path: node.path })
    }
  }
  return out
}

export async function getNextChapterNumber(projectPath: string): Promise<number> {
  let maxNum = 0
  let hasChapterOne = false
  try {
    const tree = await listDirectory(`${projectPath}/wiki/chapters`)
    const files = flattenMdFiles(tree)
    for (const file of files) {
      const byName = extractChapterNumber(file.name.replace(/\.md$/, ""))
      if (byName) {
        if (byName === 1) hasChapterOne = true
        if (byName > maxNum) maxNum = byName
      }
      try {
        const content = await readFile(file.path)
        const byFrontmatter = content.match(/^chapter_number:\s*(\d+)\s*$/m)
        if (byFrontmatter?.[1]) {
          const n = Number.parseInt(byFrontmatter[1], 10)
          if (n === 1) hasChapterOne = true
          if (n > maxNum) maxNum = n
        } else {
          const titleMatch = content.match(/^title:\s*["']?(.+?)["']?\s*$/m)
          const byTitle = titleMatch?.[1] ? extractChapterNumber(titleMatch[1]) : null
          if (byTitle) {
            if (byTitle === 1) hasChapterOne = true
            if (byTitle > maxNum) maxNum = byTitle
          }
        }
      } catch {
        // ignore unreadable chapter file
      }
    }
  } catch {
    // chapter dir may not exist yet
  }
  if (!hasChapterOne && maxNum === 0) return 1
  return maxNum + 1
}

export async function findChapterFileByNumber(projectPath: string, chapterNumber: number): Promise<string | null> {
  try {
    const tree = await listDirectory(`${projectPath}/wiki/chapters`)
    const files = flattenMdFiles(tree)
    for (const file of files) {
      const byName = extractChapterNumber(file.name.replace(/\.md$/, ""))
      if (byName === chapterNumber) return file.path
      try {
        const content = await readFile(file.path)
        const byFrontmatter = content.match(/^chapter_number:\s*(\d+)\s*$/m)
        if (byFrontmatter?.[1] && Number.parseInt(byFrontmatter[1], 10) === chapterNumber) {
          return file.path
        }
      } catch {
        // ignore unreadable chapter file
      }
    }
  } catch {
    // chapter dir may not exist yet
  }
  return null
}

export interface ResolveTargetChapterNumberForChatInput {
  projectPath: string
  userRequest: string
  routeIntent?: NovelTaskIntent
  routeChapterNumber?: number
  selectedFile?: string | null
}

export async function resolveTargetChapterNumberForChat(input: ResolveTargetChapterNumberForChatInput): Promise<number | undefined> {
  if (input.routeChapterNumber && input.routeChapterNumber > 0) {
    return input.routeChapterNumber
  }

  if (!shouldResolveNextChapter(input.userRequest, input.routeIntent)) {
    return undefined
  }

  const selectedChapterNumber = await readSelectedChapterNumber(input.selectedFile)
  if (selectedChapterNumber && selectedChapterNumber > 0) {
    return selectedChapterNumber + 1
  }

  return getNextChapterNumber(input.projectPath)
}

function shouldResolveNextChapter(userRequest: string, routeIntent?: NovelTaskIntent): boolean {
  if (routeIntent !== "continue_chapter" && routeIntent !== "write_chapter") return false
  const compact = userRequest.replace(/\s+/g, "")
  return /下一章|下1章|下章|新的?一章/.test(compact)
}

async function readSelectedChapterNumber(selectedFile?: string | null): Promise<number | undefined> {
  if (!selectedFile) return undefined
  const normalized = selectedFile.replace(/\\/g, "/")
  if (!/\/wiki\/chapters\//i.test(normalized)) return undefined

  const byName = extractChapterNumber(normalized.split("/").pop()?.replace(/\.md$/i, "") ?? "")
  if (byName) return byName

  try {
    const content = await readFile(selectedFile)
    const byFrontmatter = content.match(/^chapter_number:\s*(\d+)\s*$/m)
    if (byFrontmatter?.[1]) {
      const n = Number.parseInt(byFrontmatter[1], 10)
      if (Number.isFinite(n) && n > 0) return n
    }
  } catch {
    // ignore unreadable selected chapter file
  }
  return undefined
}

export async function readSelectedChapterNumberForFile(selectedFile?: string | null): Promise<number | undefined> {
  return readSelectedChapterNumber(selectedFile)
}
