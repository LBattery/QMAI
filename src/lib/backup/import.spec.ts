// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

const { invokeMock, listenMock, unlistenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
  unlistenMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }))
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }))
vi.mock("@/lib/project-identity", () => ({ loadRegistry: vi.fn(), upsertProjectInfo: vi.fn() }))
vi.mock("@/lib/project-refresh", () => ({ refreshProjectState: vi.fn() }))
vi.mock("@/stores/wiki-store", () => ({
  useWikiStore: { getState: () => ({ project: null }) },
}))

import { importBackup } from "./import"

const preview = {
  backupVersion: 2,
  contents: { globalConfig: true, uiPreferences: true, credentials: false },
  projects: [],
}

function importResult(replaceLocalStorage: boolean) {
  return {
    success: true,
    appState: null,
    localStorageData: { "qmai-new-layout": "wide" },
    replaceLocalStorage,
    projects: [],
    warnings: [],
    error: null,
  }
}

describe("V2 备份导入适配", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    listenMock.mockResolvedValue(unlistenMock)
  })

  it("部分界面偏好采用合并恢复并保留当前键", async () => {
    localStorage.setItem("qmai-existing-layout", "compact")
    invokeMock.mockImplementation((command: string) => {
      if (command === "read_backup_manifest") return Promise.resolve(preview)
      if (command === "import_backup") return Promise.resolve(importResult(false))
      throw new Error(`unexpected command: ${command}`)
    })

    await importBackup("full", undefined, undefined, "C:/backup/partial.zip")

    expect(localStorage.getItem("qmai-existing-layout")).toBe("compact")
    expect(localStorage.getItem("qmai-new-layout")).toBe("wide")
  })

  it("完整或 V1 界面偏好仍清除旧键后恢复", async () => {
    localStorage.setItem("qmai-existing-layout", "compact")
    localStorage.setItem("unrelated", "keep")
    invokeMock.mockImplementation((command: string) => {
      if (command === "read_backup_manifest") return Promise.resolve(preview)
      if (command === "import_backup") return Promise.resolve(importResult(true))
      throw new Error(`unexpected command: ${command}`)
    })

    await importBackup("full", undefined, undefined, "C:/backup/full.zip")

    expect(localStorage.getItem("qmai-existing-layout")).toBeNull()
    expect(localStorage.getItem("qmai-new-layout")).toBe("wide")
    expect(localStorage.getItem("unrelated")).toBe("keep")
  })

  it("仅导入全局配置时不检查项目路径", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "read_backup_manifest") throw new Error("不应读取项目路径")
      if (command === "import_backup") return Promise.resolve(importResult(false))
      throw new Error(`unexpected command: ${command}`)
    })

    const result = await importBackup("global-only", undefined, undefined, "C:/backup/global.zip")

    expect(result.success).toBe(true)
    expect(invokeMock).not.toHaveBeenCalledWith("read_backup_manifest", expect.anything())
  })
})
