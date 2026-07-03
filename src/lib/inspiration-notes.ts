import { createDirectory, readFile, writeFile } from "@/commands/fs"
import { normalizePath } from "@/lib/path-utils"

/**
 * 灵感记录：项目本地的零散灵感便签，按时间戳条目持久化到
 * `<project>/.qmai/inspiration-notes.json`，与大纲页的「续写灵感」
 * (一次性生成) 互补——这里是作者随时随手记、可检索可编辑的灵感库。
 */

export interface InspirationNote {
  id: string
  createdAt: number
  updatedAt: number
  content: string
}

export interface InspirationNotesData {
  notes: InspirationNote[]
}

const FILE_NAME = ".qmai/inspiration-notes.json"

export function getInspirationNotesPath(projectPath: string): string {
  return `${normalizePath(projectPath)}/${FILE_NAME}`
}

function normalizeNote(raw: Partial<InspirationNote> | undefined): InspirationNote | null {
  if (!raw || typeof raw !== "object") return null
  const id = typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID()
  const now = Date.now()
  const createdAt = typeof raw.createdAt === "number" && raw.createdAt > 0 ? raw.createdAt : now
  const updatedAt = typeof raw.updatedAt === "number" && raw.updatedAt > 0 ? raw.updatedAt : createdAt
  const content = typeof raw.content === "string" ? raw.content : ""
  return { id, createdAt, updatedAt, content }
}

export async function loadInspirationNotes(projectPath: string): Promise<InspirationNote[]> {
  try {
    const raw = await readFile(getInspirationNotesPath(projectPath))
    const parsed = JSON.parse(raw) as Partial<InspirationNotesData>
    const list = Array.isArray(parsed?.notes) ? parsed.notes : []
    return list
      .map((item) => normalizeNote(item as Partial<InspirationNote>))
      .filter((note): note is InspirationNote => note !== null)
      .sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

export async function saveInspirationNotes(projectPath: string, notes: InspirationNote[]): Promise<void> {
  const pp = normalizePath(projectPath)
  await createDirectory(`${pp}/.qmai`).catch(() => {})
  const sorted = [...notes].sort((a, b) => b.createdAt - a.createdAt)
  await writeFile(getInspirationNotesPath(pp), JSON.stringify({ notes: sorted }, null, 2))
}
