import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(__dirname, "../../..")

describe("dismantling library implementation", () => {
  it("keeps the book analysis routing connected", () => {
    const storeSource = readFileSync(resolve(root, "src/stores/wiki-store.ts"), "utf8")
    const sidebarSource = readFileSync(resolve(root, "src/components/layout/icon-sidebar.tsx"), "utf8")
    const contentSource = readFileSync(resolve(root, "src/components/layout/content-area.tsx"), "utf8")

    expect(storeSource).toContain('"bookAnalysis"')
    expect(sidebarSource).toContain('view: "bookAnalysis"')
    expect(sidebarSource).toContain("novel.nav.dismantling")
    expect(contentSource).toContain("BookAnalysisView")
    expect(contentSource).toContain("@/components/novel/book-analysis-view")
  })

  it("keeps the underlying dismantling implementation intact", () => {
    const viewSource = readFileSync(resolve(root, "src/components/novel/dismantling-view.tsx"), "utf8")

    expect(viewSource).toContain("拆文结果")
  })

  it("keeps the dismantling sidebar helpers intact", () => {
    const sidebarSource = readFileSync(resolve(root, "src/components/layout/sidebar-panel.tsx"), "utf8")

    expect(sidebarSource).toContain("正在提取章节")
    expect(sidebarSource).toContain("已存在相同拆文作品")
    expect(sidebarSource).toContain("normalizeDismantlingProjectTitle")
  })
})
