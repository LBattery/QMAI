import { describe, expect, it } from "vitest"
import { allChangelog, currentVersionChangelog } from "./changelog"

describe("changelog", () => {
  it("shows the 2.2.1 dismantling release before earlier consolidated releases", () => {
    const entries = allChangelog()
    const versions = entries.map((entry) => entry.version)

    expect(versions[0]).toBe("2.2.1")
    expect(versions[1]).toBe("2.2.0")
    expect(versions[2]).toBe("2.1.0")
    expect(versions[3]).toBe("2.0.0")
    for (let patch = 1; patch <= 10; patch += 1) {
      expect(versions).not.toContain(`2.1.${patch}`)
      expect(currentVersionChangelog(`2.1.${patch}`)).toEqual([])
    }
    for (let patch = 1; patch <= 12; patch += 1) {
      expect(versions).not.toContain(`2.0.${patch}`)
      expect(currentVersionChangelog(`2.0.${patch}`)).toEqual([])
    }
    expect(versions).toContain("1.0.7")
    for (let patch = 8; patch <= 32; patch += 1) {
      expect(versions).not.toContain(`1.0.${patch}`)
    }

    const release = currentVersionChangelog("2.0.0")[0]
    expect(release.highlights.en.join("\n")).toContain("Major release")
    expect(release.highlights.en.join("\n")).toContain("Review Center")
    expect(release.highlights.en.join("\n")).toContain("AI Rewrite")
  })

  it("returns the 2.2.0 changelog entry for the current version", () => {
    const release = currentVersionChangelog("2.2.0")[0]
    const zh = release.highlights.zh.join("\n")
    const en = release.highlights.en.join("\n")

    expect(release.version).toBe("2.2.0")
    expect(en).toContain("Continue Next Chapter")
    expect(en).toContain("target chapter number")
    expect(en).toContain("Character Soul")
    expect(en).toContain("2,200-3,200")
    expect(en).toContain("network errors")
    expect(zh).not.toContain("联系方式")
  })

  it("returns the 2.2.1 changelog entry for dismantling library", () => {
    const release = currentVersionChangelog("2.2.1")[0]
    const zh = release.highlights.zh.join("\n")
    const en = release.highlights.en.join("\n")

    expect(release.version).toBe("2.2.1")
    expect(en).toContain("Dismantling Library")
    expect(en).toContain("deep chapter generation")
    expect(zh).toContain("拆文库")
    expect(zh).toContain("拆文结构不是当前小说记忆")
  })
})
