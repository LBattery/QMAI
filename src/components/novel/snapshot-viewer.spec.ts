import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(resolve(__dirname, "snapshot-viewer.tsx"), "utf8")

describe("snapshot viewer clothing compatibility", () => {
  it("shows and edits the restored clothing field", () => {
    expect(source).toContain('t("novel.snapshot.characterAppearanceAndStatus")')
    expect(source).toContain("data.characterAppearanceAndStatus ?? []")
    expect(source).toContain('editList("characterAppearanceAndStatus", value)')
  })
})
