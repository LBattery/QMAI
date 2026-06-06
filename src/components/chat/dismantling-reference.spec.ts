import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(__dirname, "../../..")

describe("chat dismantling reference", () => {
  it("injects only explicitly enabled dismantling structure into chat prompts", () => {
    const chatSource = readFileSync(resolve(root, "src/components/chat/chat-panel.tsx"), "utf8")
    const dismantlingSource = readFileSync(resolve(root, "src/lib/novel/dismantling.ts"), "utf8")

    expect(chatSource).toContain("loadDismantlingLibrary")
    expect(chatSource).toContain("buildDismantlingReferenceDirective")
    expect(chatSource).toContain("useInChat")
    expect(chatSource).toContain("dismantlingDirective")
    expect(dismantlingSource).toContain("参考拆文结构")
    expect(dismantlingSource).toContain("拆文结构不是当前小说记忆")
  })
})
