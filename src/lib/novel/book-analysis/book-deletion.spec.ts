import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  fileExists: vi.fn(),
  deleteFile: vi.fn(),
  removeBookLibraryEntry: vi.fn(),
  removeBatchImportHistoryForBook: vi.fn(),
}))

vi.mock("@/commands/fs", () => ({
  fileExists: mocks.fileExists,
  deleteFile: mocks.deleteFile,
}))

vi.mock("@/lib/novel/book-analysis/library-store", () => ({
  removeBookLibraryEntry: mocks.removeBookLibraryEntry,
}))

vi.mock("@/lib/novel/book-analysis/batch-import-storage", () => ({
  removeBatchImportHistoryForBook: mocks.removeBatchImportHistoryForBook,
}))

import { deleteBookAnalysisBook } from "./book-deletion"

const EMPTY_HISTORY = {
  removedTaskIds: [],
  tasks: [],
  batches: [],
}

describe("deleteBookAnalysisBook", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fileExists.mockResolvedValue(true)
    mocks.deleteFile.mockResolvedValue(undefined)
    mocks.removeBookLibraryEntry.mockResolvedValue(undefined)
    mocks.removeBatchImportHistoryForBook.mockResolvedValue(EMPTY_HISTORY)
  })

  it.each(["", "   "])("在任何文件操作前拒绝空项目路径：%j", async (projectPath) => {
    await expect(deleteBookAnalysisBook(projectPath, "book-safe")).rejects.toThrow("项目路径不能为空")

    expect(mocks.fileExists).not.toHaveBeenCalled()
    expect(mocks.deleteFile).not.toHaveBeenCalled()
    expect(mocks.removeBookLibraryEntry).not.toHaveBeenCalled()
    expect(mocks.removeBatchImportHistoryForBook).not.toHaveBeenCalled()
  })

  it.each([
    "book-../secret",
    "../book-safe",
    "book-safe/child",
    "safe",
    "book-",
  ])("在任何文件操作前拒绝不合法作品 ID：%s", async (bookId) => {
    await expect(deleteBookAnalysisBook("E:/Novel", bookId)).rejects.toThrow("作品 ID 不合法")

    expect(mocks.deleteFile).not.toHaveBeenCalled()
    expect(mocks.fileExists).not.toHaveBeenCalled()
    expect(mocks.removeBookLibraryEntry).not.toHaveBeenCalled()
    expect(mocks.removeBatchImportHistoryForBook).not.toHaveBeenCalled()
  })

  it("只从项目路径和作品 ID 推导目录，并按顺序删除目录、索引和导入历史", async () => {
    const history = {
      removedTaskIds: ["task-1"],
      tasks: [],
      batches: [],
    }
    mocks.removeBatchImportHistoryForBook.mockResolvedValueOnce(history)

    const result = await deleteBookAnalysisBook("E:\\Novel\\", "book-safe_1")

    expect(mocks.deleteFile).toHaveBeenCalledWith("E:/Novel/book-analysis/book-safe_1")
    expect(mocks.removeBookLibraryEntry).toHaveBeenCalledWith("E:\\Novel\\", "book-safe_1")
    expect(mocks.removeBatchImportHistoryForBook).toHaveBeenCalledWith(
      "E:\\Novel\\",
      "book-safe_1",
    )
    expect(mocks.deleteFile.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.removeBookLibraryEntry.mock.invocationCallOrder[0],
    )
    expect(mocks.removeBookLibraryEntry.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.removeBatchImportHistoryForBook.mock.invocationCallOrder[0],
    )
    expect(result).toBe(history)
  })

  it("作品目录已不存在时仍继续清理索引和导入历史以支持重试", async () => {
    mocks.fileExists.mockResolvedValueOnce(false)

    await expect(deleteBookAnalysisBook("E:/Novel", "book-safe")).resolves.toBe(EMPTY_HISTORY)

    expect(mocks.deleteFile).not.toHaveBeenCalled()
    expect(mocks.removeBookLibraryEntry).toHaveBeenCalledWith("E:/Novel", "book-safe")
    expect(mocks.removeBatchImportHistoryForBook).toHaveBeenCalledWith("E:/Novel", "book-safe")
  })

  it.each([
    "deleteFile",
    "removeBookLibraryEntry",
    "removeBatchImportHistoryForBook",
  ] as const)("%s 失败时向上传播原错误并停止后续调用", async (failedStep) => {
    const error = new Error(`${failedStep} 失败`)
    mocks[failedStep].mockRejectedValueOnce(error)

    await expect(deleteBookAnalysisBook("E:/Novel", "book-safe")).rejects.toBe(error)

    if (failedStep === "deleteFile") {
      expect(mocks.removeBookLibraryEntry).not.toHaveBeenCalled()
      expect(mocks.removeBatchImportHistoryForBook).not.toHaveBeenCalled()
    } else if (failedStep === "removeBookLibraryEntry") {
      expect(mocks.deleteFile).toHaveBeenCalledOnce()
      expect(mocks.removeBatchImportHistoryForBook).not.toHaveBeenCalled()
    } else {
      expect(mocks.deleteFile).toHaveBeenCalledOnce()
      expect(mocks.removeBookLibraryEntry).toHaveBeenCalledOnce()
    }
  })
})
