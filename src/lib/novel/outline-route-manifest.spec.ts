import { describe, expect, it } from "vitest"
import {
  findOutlineManifestRoute,
  getOutlineRouteManifest,
  resolveOutlineManifestSkillNames,
} from "./outline-route-manifest"

describe("outline-route-manifest", () => {
  it("读取 SkillHub 的 AI 大纲路由清单并保持正文关闭", () => {
    const manifest = getOutlineRouteManifest()

    expect(manifest.routes).toHaveLength(39)
    expect(manifest.plannedCoverage).toEqual({ male: [], female: [], short: [] })
    expect(manifest.bodyGeneration.enabledInAiOutline).toBe(false)
  })

  it("按长短篇、男频女频和题材匹配专用题材 skill", () => {
    expect(findOutlineManifestRoute({
      lengthType: "long",
      audience: "male",
      genre: "玄幻",
    })?.primarySkill).toBe("TicaiSkill/male-xuanhuan-xianxia")

    expect(findOutlineManifestRoute({
      lengthType: "long",
      audience: "female",
      genre: "玄幻",
    })?.primarySkill).toBe("TicaiSkill/female-xuanhuan-fantasy")
  })

  it("解析出的 AI 大纲 skill 列表不包含正文 skill", () => {
    const skills = resolveOutlineManifestSkillNames({
      lengthType: "long",
      audience: "male",
      genre: "御兽",
    })

    expect(skills).toContain("male-beast-taming")
    expect(skills).toContain("outline-quality-check")
    expect(skills.some((name) => name.includes("long-form-drafting"))).toBe(false)
  })
})
