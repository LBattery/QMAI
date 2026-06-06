import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(__dirname, "../../..")

describe("dismantling library view", () => {
  it("adds an isolated dismantling library navigation entry", () => {
    const storeSource = readFileSync(resolve(root, "src/stores/wiki-store.ts"), "utf8")
    const sidebarSource = readFileSync(resolve(root, "src/components/layout/icon-sidebar.tsx"), "utf8")
    const contentSource = readFileSync(resolve(root, "src/components/layout/content-area.tsx"), "utf8")

    expect(storeSource).toContain('"dismantling"')
    expect(sidebarSource).toContain('view: "dismantling"')
    expect(sidebarSource).toContain("novel.nav.dismantling")
    expect(contentSource).toContain("DismantlingView")
    expect(contentSource).toContain("@/components/novel/dismantling-view")
  })

  it("keeps dismantling memory separate from novel memory in the page copy", () => {
    const viewSource = readFileSync(resolve(root, "src/components/novel/dismantling-view.tsx"), "utf8")

    expect(viewSource).toContain("拆文库")
    expect(viewSource).toContain("独立拆文记忆库")
    expect(viewSource).toContain("不会写入小说记忆")
    expect(viewSource).toContain("每批章节数")
    expect(viewSource).toContain("使用拆文结构")
  })
})
