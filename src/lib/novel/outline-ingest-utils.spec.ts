import { describe, expect, it, vi } from "vitest"
import { getOutlineFileName, getOutlineIngestIdentity, outlineSnapshotExists } from "./outline-ingest-utils"

vi.mock("@/commands/fs", () => ({
  fileExists: vi.fn(),
}))

import { fileExists } from "@/commands/fs"

describe("getOutlineIngestIdentity", () => {
  it("derives a stable negative chapter number and snapshot path from outline filename", () => {
    const identity = getOutlineIngestIdentity("/proj", "/proj/wiki/outlines/vol-1-outline.md")
    expect(identity.outlineName).toBe("vol-1-outline")
    expect(identity.chapterNumber).toBeLessThan(0)
    expect(identity.snapshotJsonPath).toMatch(/\.novel\/snapshots\/outline-\d{3}\.snapshot\.json$/)
  })

  it("returns the same identity for the same outline path", () => {
    const left = getOutlineIngestIdentity("/proj", "/proj/wiki/outlines/plot.md")
    const right = getOutlineIngestIdentity("/proj", "/proj/wiki/outlines/plot.md")
    expect(left).toEqual(right)
  })
})

describe("getOutlineFileName", () => {
  it("strips extension and falls back when path is empty", () => {
    expect(getOutlineFileName("/a/b/story-outline.md")).toBe("story-outline")
    expect(getOutlineFileName("")).toBe("大纲")
  })
})

describe("outlineSnapshotExists", () => {
  it("checks the derived snapshot json path", async () => {
    vi.mocked(fileExists).mockResolvedValueOnce(true)
    await expect(outlineSnapshotExists("/proj", "/proj/wiki/outlines/plot.md")).resolves.toBe(true)
    expect(fileExists).toHaveBeenCalledWith(expect.stringContaining("/proj/.novel/snapshots/outline-"))
  })
})
