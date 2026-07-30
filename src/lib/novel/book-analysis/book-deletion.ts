import { deleteFile, fileExists } from "@/commands/fs"
import { joinPath } from "@/lib/path-utils"
import {
  removeBatchImportHistoryForBook,
  type RemovedBookImportHistory,
} from "@/lib/novel/book-analysis/batch-import-storage"
import { removeBookLibraryEntry } from "@/lib/novel/book-analysis/library-store"

const BOOK_ID_PATTERN = /^book-[A-Za-z0-9_-]+$/

export async function deleteBookAnalysisBook(
  projectPath: string,
  bookId: string,
): Promise<RemovedBookImportHistory> {
  if (!projectPath.trim()) throw new Error("项目路径不能为空")
  if (!BOOK_ID_PATTERN.test(bookId)) throw new Error("作品 ID 不合法")

  const bookPath = joinPath(projectPath, "book-analysis", bookId)
  if (await fileExists(bookPath)) await deleteFile(bookPath)
  await removeBookLibraryEntry(projectPath, bookId)
  const history = await removeBatchImportHistoryForBook(projectPath, bookId)
  try {
    const { rebuildBookAnalysisContextIndex } = await import("./analysis-context-index")
    await rebuildBookAnalysisContextIndex(projectPath)
  } catch (error) {
    console.warn("删除作品后重建拆书上下文索引失败", error)
  }
  return history
}
