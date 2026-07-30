import { describe, expect, it } from "vitest"
import { normalizeUserSkill } from "./skill-library"
import {
  DEFAULT_SKILL_ROUTE_CATEGORIES,
  filterSkillsForSkillRoute,
  inferSkillRoute,
  resolveOutlineTopicSkillRoutes,
  SKILL_ROUTE_CATEGORY_IDS,
} from "./skill-route"

describe("skill-route", () => {
  it("defines the default skill folders used by writing and outline routing", () => {
    expect(DEFAULT_SKILL_ROUTE_CATEGORIES.map((category) => category.name)).toEqual([
      "正文",
      "大纲",
      "设定",
      "角色",
      "世界观",
      "势力",
      "伏笔",
      "地图",
      "题材",
    ])
  })

  it("prefers explicit category folders when resolving a skill route", () => {
    const skill = normalizeUserSkill({
      id: "skill:outline",
      name: "正文输出协议",
      kind: ["output"],
      stages: ["output"],
      modes: ["standard", "strict"],
      content: "只输出正文",
      categoryId: SKILL_ROUTE_CATEGORY_IDS.outline,
    })

    expect(inferSkillRoute(skill)).toBe("outline")
  })

  it("filters skills by route and excludes skills from other folders", () => {
    const outlineSkill = normalizeUserSkill({
      id: "skill:outline",
      name: "章纲结构",
      kind: ["planning"],
      stages: ["planning"],
      modes: ["standard", "strict"],
      content: "生成章纲",
      categoryId: SKILL_ROUTE_CATEGORY_IDS.outline,
    })
    const writingSkill = normalizeUserSkill({
      id: "skill:writing",
      name: "正文输出协议",
      kind: ["output"],
      stages: ["output"],
      modes: ["standard", "strict"],
      content: "只输出正文",
      categoryId: SKILL_ROUTE_CATEGORY_IDS.writing,
    })

    expect(filterSkillsForSkillRoute([outlineSkill, writingSkill], "outline")).toEqual([outlineSkill])
  })

  it("为不同频道和题材补充章纲生成 Skill 路由", () => {
    expect(resolveOutlineTopicSkillRoutes({ channel: "male", genre: "玄幻" })).toEqual(expect.arrayContaining([
      "outline",
      "topic",
      "worldbuilding",
      "setting",
      "faction",
      "map",
    ]))

    expect(resolveOutlineTopicSkillRoutes({ channel: "female", genre: "知乎短篇" })).toEqual(expect.arrayContaining([
      "outline",
      "topic",
      "character",
      "foreshadowing",
    ]))
  })
})
