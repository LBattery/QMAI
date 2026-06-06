import { createDirectory, fileExists, readFile, writeFile } from "@/commands/fs"
import { normalizePath } from "@/lib/path-utils"

export type DismantlingChapterStatus = "pending" | "running" | "done" | "failed"

export interface DismantlingChapter {
  id: string
  chapterNumber: number
  title: string
  content: string
  status: DismantlingChapterStatus
  error?: string
}

export interface DismantlingAnalysis {
  id: string
  chapterIds: string[]
  title: string
  createdAt: number
  markdown: string
  structureMemory: string[]
}

export interface DismantlingProject {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  chapters: DismantlingChapter[]
  analyses: DismantlingAnalysis[]
  structureMemory: string[]
  useInChat?: boolean
}

export interface DismantlingLibrary {
  version: 1
  projects: DismantlingProject[]
  selectedProjectId?: string | null
}

export interface DismantlingBatchOptions {
  selectedChapterIds: string[]
  batchSize: number
}

const DEFAULT_LIBRARY: DismantlingLibrary = {
  version: 1,
  projects: [],
  selectedProjectId: null,
}

export function getDismantlingLibraryPath(projectPath: string): string {
  return `${normalizePath(projectPath)}/.qmai/dismantling/library.json`
}

export function getDismantlingLibraryDir(projectPath: string): string {
  return `${normalizePath(projectPath)}/.qmai/dismantling`
}

export async function loadDismantlingLibrary(projectPath: string): Promise<DismantlingLibrary> {
  const path = getDismantlingLibraryPath(projectPath)
  if (!(await fileExists(path))) return { ...DEFAULT_LIBRARY }
  try {
    const parsed = JSON.parse(await readFile(path)) as Partial<DismantlingLibrary>
    return normalizeDismantlingLibrary(parsed)
  } catch {
    return { ...DEFAULT_LIBRARY }
  }
}

export async function saveDismantlingLibrary(projectPath: string, library: DismantlingLibrary): Promise<void> {
  await createDirectory(getDismantlingLibraryDir(projectPath)).catch(() => {})
  await writeFile(getDismantlingLibraryPath(projectPath), JSON.stringify(normalizeDismantlingLibrary(library), null, 2))
}

export function normalizeDismantlingLibrary(input: Partial<DismantlingLibrary> | null | undefined): DismantlingLibrary {
  const projects = Array.isArray(input?.projects) ? input.projects.map(normalizeDismantlingProject).filter(Boolean) : []
  return {
    version: 1,
    projects,
    selectedProjectId: input?.selectedProjectId ?? projects[0]?.id ?? null,
  }
}

function normalizeDismantlingProject(input: Partial<DismantlingProject> | null | undefined): DismantlingProject {
  const now = Date.now()
  const chapters = Array.isArray(input?.chapters)
    ? input.chapters.map((chapter, index) => normalizeDismantlingChapter(chapter, index + 1))
    : []
  const analyses = Array.isArray(input?.analyses)
    ? input.analyses.map(normalizeDismantlingAnalysis)
    : []
  return {
    id: input?.id || `dismantling-${now}`,
    title: input?.title || "未命名拆文作品",
    createdAt: Number(input?.createdAt) || now,
    updatedAt: Number(input?.updatedAt) || now,
    chapters,
    analyses,
    structureMemory: Array.isArray(input?.structureMemory) ? input.structureMemory.filter(Boolean) : [],
    useInChat: Boolean(input?.useInChat),
  }
}

function normalizeDismantlingChapter(input: Partial<DismantlingChapter>, fallbackNumber: number): DismantlingChapter {
  return {
    id: input.id || `chapter-${fallbackNumber}`,
    chapterNumber: Number(input.chapterNumber) || fallbackNumber,
    title: input.title || `第${fallbackNumber}章`,
    content: input.content || "",
    status: input.status ?? "pending",
    error: input.error,
  }
}

function normalizeDismantlingAnalysis(input: Partial<DismantlingAnalysis>): DismantlingAnalysis {
  return {
    id: input.id || `analysis-${Date.now()}`,
    chapterIds: Array.isArray(input.chapterIds) ? input.chapterIds : [],
    title: input.title || "拆文结果",
    createdAt: Number(input.createdAt) || Date.now(),
    markdown: input.markdown || "",
    structureMemory: Array.isArray(input.structureMemory) ? input.structureMemory.filter(Boolean) : [],
  }
}

export function splitDismantlingTextIntoChapters(text: string): DismantlingChapter[] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim()
  if (!normalized) return []

  const headingPattern = /^(?:#{1,3}\s*)?(第\s*(?:\d+|[零〇一二三四五六七八九十百千万两]+)\s*[章节卷回][^\n]*|chapter\s*\d+[^\n]*)$/gim
  const matches = [...normalized.matchAll(headingPattern)]
  if (matches.length === 0) {
    return [{
      id: "chapter-001",
      chapterNumber: 1,
      title: "第1章",
      content: normalized,
      status: "pending",
    }]
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0
    const nextStart = matches[index + 1]?.index ?? normalized.length
    const raw = normalized.slice(start, nextStart).trim()
    const [titleLine = `第${index + 1}章`, ...bodyLines] = raw.split("\n")
    const chapterNumber = extractDismantlingChapterNumber(titleLine) ?? index + 1
    return {
      id: `chapter-${String(chapterNumber).padStart(3, "0")}`,
      chapterNumber,
      title: titleLine.replace(/^#{1,3}\s*/, "").trim(),
      content: bodyLines.join("\n").trim(),
      status: "pending",
    }
  })
}

export function extractDismantlingChapterNumber(value: string): number | null {
  const normalized = value.normalize("NFKC")
  const digit = normalized.match(/(?:第|chapter\s*)\s*0*(\d+)/i)?.[1]
  if (digit) return Number.parseInt(digit, 10)
  const chinese = normalized.match(/第\s*([零〇一二三四五六七八九十百千万两]+)\s*[章节卷回]/)?.[1]
  return chinese ? parseChineseNumber(chinese) : null
}

function parseChineseNumber(value: string): number | null {
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 }
  let total = 0
  let section = 0
  let number = 0
  let seen = false
  for (const char of value) {
    if (digits[char] !== undefined) {
      number = digits[char]
      seen = true
      continue
    }
    const unit = units[char]
    if (!unit) return null
    seen = true
    if (unit === 10000) {
      section = (section + (number || 1)) * unit
      total += section
      section = 0
    } else {
      section += (number || 1) * unit
    }
    number = 0
  }
  const result = total + section + number
  return seen && result > 0 ? result : null
}

export function selectNextDismantlingBatch(
  project: DismantlingProject,
  options: DismantlingBatchOptions,
): DismantlingChapter[] {
  const selected = new Set(options.selectedChapterIds)
  const batchSize = Math.max(1, Math.min(10, Math.floor(options.batchSize || 1)))
  return project.chapters
    .filter((chapter) => selected.has(chapter.id) && chapter.status !== "done")
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .slice(0, batchSize)
}

export function buildDismantlingAnalysisPrompt(input: {
  projectTitle: string
  chapters: DismantlingChapter[]
}): string {
  return [
    "你是小说拆文分析助手。请把下面章节拆成可复用的写法结构，结果写入独立拆文记忆库。",
    "",
    "重要边界：",
    "- 拆文结果只服务写作结构参考，不得把原作人物、设定、剧情当成当前小说事实。",
    "- 不要复述大段原文，不要输出可替代原文的连续文本。",
    "- 只输出结构化写法分析，重点分析章节结构、冲突推进、爽点、情绪节奏、人物作用、信息增量、结尾钩子和可复用模板。",
    "- 后续 AI 写作只能学习节奏、冲突推进、爽点安排和章节钩子，不得复用原作人物、设定、剧情和具体表达。",
    "",
    `拆文作品：${input.projectTitle}`,
    "",
    "请按以下 Markdown 结构输出：",
    "## 本批总览",
    "## 章节拆解",
    "## 人物与关系写法",
    "## 冲突与爽点",
    "## 结尾钩子",
    "## 可复用结构记忆",
    "",
    "章节内容：",
    input.chapters.map((chapter) => [
      `### ${chapter.title}`,
      `章节序号：${chapter.chapterNumber}`,
      chapter.content,
    ].join("\n")).join("\n\n"),
  ].join("\n")
}

export function extractStructureMemoryFromAnalysis(markdown: string): string[] {
  const sectionMatch = markdown.match(/##\s*可复用结构记忆\s*\n([\s\S]*)$/)
  const raw = sectionMatch?.[1] ?? markdown
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
    .filter((line) => line.length >= 6)
    .slice(0, 30)
}

export function buildDismantlingReferenceDirective(input: {
  title: string
  structureMemory: string[]
}): string {
  if (input.structureMemory.length === 0) return ""
  return [
    "## 参考拆文结构",
    `当前用户选择参考拆文作品：${input.title}`,
    "",
    "使用规则：",
    "- 只学习节奏、冲突推进、爽点安排和章节钩子。",
    "- 不得复用原作人物、不得复用原作设定、不得复用原作剧情、不得复用原作具体表达。",
    "- 拆文结构不是当前小说记忆，不得把它当成当前小说已经发生的事实。",
    "",
    "可参考的结构记忆：",
    ...input.structureMemory.map((item) => `- ${item}`),
  ].join("\n")
}

