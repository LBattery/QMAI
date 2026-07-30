import { describe, expect, it } from "vitest"
import { buildDeAiBatchCatalog } from "./catalog"
import type { FileNode, WikiProject } from "@/types/wiki"

const project: WikiProject = { id: "project-a", name: "当前作品", path: "C:/project" }
const tree: FileNode[] = [{
  name: "wiki",
  path: "C:/project/wiki",
  is_dir: true,
  children: [{
    name: "chapters",
    path: "C:/project/wiki/chapters",
    is_dir: true,
    children: [
      {
        name: "作品甲",
        path: "C:/project/wiki/chapters/作品甲",
        is_dir: true,
        children: [
          { name: "第2章.md", path: "C:/project/wiki/chapters/作品甲/第2章.md", is_dir: false },
          { name: "第1章.md", path: "C:/project/wiki/chapters/作品甲/第1章.md", is_dir: false },
        ],
      },
      {
        name: "作品乙",
        path: "C:/project/wiki/chapters/作品乙",
        is_dir: true,
        children: [{ name: "第1章.md", path: "C:/project/wiki/chapters/作品乙/第1章.md", is_dir: false }],
      },
      { name: "说明.txt", path: "C:/project/wiki/chapters/说明.txt", is_dir: false },
    ],
  }],
}]

describe("de-ai batch catalog", () => {
  it("按章节目录的一级子目录生成多作品目录并按章节号排序", () => {
    const catalog = buildDeAiBatchCatalog(project, tree)

    expect(catalog.map((work) => work.title)).toEqual(["作品甲", "作品乙"])
    expect(catalog[0].chapters.map((chapter) => chapter.title)).toEqual(["第1章", "第2章"])
  })

  it("生成的作品和章节 ID 只能包含安全字符", () => {
    const catalog = buildDeAiBatchCatalog(project, tree)

    for (const work of catalog) {
      expect(work.id).toMatch(/^[A-Za-z0-9_-]+$/)
      for (const chapter of work.chapters) expect(chapter.id).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })
})
