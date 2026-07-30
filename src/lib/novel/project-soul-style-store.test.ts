import { beforeEach, describe, expect, it, vi } from "vitest"
import * as fs from "@/commands/fs"
import {
  createEmptyProjectSoulStyle,
  loadProjectSoulStyleStore,
  saveProjectSoulStyleStore,
} from "./project-soul-style-store"

vi.mock("@/commands/fs", () => ({
  createDirectory: vi.fn(),
  readFile: vi.fn(),
  writeFileAtomic: vi.fn(),
}))

const mockCreateDirectory = vi.mocked(fs.createDirectory)
const mockReadFile = vi.mocked(fs.readFile)
const mockWriteFileAtomic = vi.mocked(fs.writeFileAtomic)

beforeEach(() => {
  vi.clearAllMocks()
  vi.setSystemTime(new Date("2026-07-06T12:00:00.000Z"))
})

describe("project soul style store", () => {
  it("migrates existing soul.md into a default enabled style when the style store is missing", async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error("missing style store"))
      .mockResolvedValueOnce("冷峻克制，叙事推进快")

    const store = await loadProjectSoulStyleStore("/project/path")

    expect(mockReadFile).toHaveBeenNthCalledWith(1, "/project/path/.qmai/project-soul-styles.json")
    expect(mockReadFile).toHaveBeenNthCalledWith(2, "/project/path/soul.md")
    expect(store.enabledStyleId).toBe(store.styles[0]?.id)
    expect(store.styles[0]).toMatchObject({
      name: "默认项目灵魂",
      content: "冷峻克制，叙事推进快",
    })
  })

  it("normalizes loaded styles so only the enabled style is selected", async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify({
      version: 1,
      enabledStyleId: "style-2",
      styles: [
        { id: "style-1", name: "轻松", content: "轻松吐槽", enabled: true, createdAt: 1, updatedAt: 1 },
        { id: "style-2", name: "冷峻", content: "冷峻写实", enabled: false, createdAt: 2, updatedAt: 2 },
      ],
    }))

    const store = await loadProjectSoulStyleStore("/project/path")

    expect(store.enabledStyleId).toBe("style-2")
    expect(store.styles.map((style) => [style.id, style.enabled])).toEqual([
      ["style-1", false],
      ["style-2", true],
    ])
  })

  it("saves the structured store and writes the enabled style content back to soul.md", async () => {
    const store = {
      version: 1 as const,
      enabledStyleId: "style-2",
      styles: [
        { id: "style-1", name: "轻松", content: "轻松吐槽", enabled: false, createdAt: 1, updatedAt: 1 },
        { id: "style-2", name: "冷峻", content: "冷峻写实", enabled: true, createdAt: 2, updatedAt: 2 },
      ],
    }

    await saveProjectSoulStyleStore("/project/path", store)

    expect(mockCreateDirectory).toHaveBeenCalledWith("/project/path/.qmai")
    expect(mockWriteFileAtomic).toHaveBeenCalledWith(
      "/project/path/.qmai/project-soul-styles.json",
      expect.stringContaining('"enabledStyleId": "style-2"'),
    )
    expect(mockWriteFileAtomic).toHaveBeenCalledWith("/project/path/soul.md", "冷峻写实")
  })

  it("creates a blank disabled style with a stable default name", () => {
    const style = createEmptyProjectSoulStyle("新写作风格")

    expect(style).toMatchObject({
      name: "新写作风格",
      content: "",
      enabled: false,
      createdAt: Date.parse("2026-07-06T12:00:00.000Z"),
      updatedAt: Date.parse("2026-07-06T12:00:00.000Z"),
    })
    expect(style.id).toMatch(/^project-soul-style-/)
  })
})
