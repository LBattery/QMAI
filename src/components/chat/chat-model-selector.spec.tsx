import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(resolve(__dirname, "chat-model-selector.tsx"), "utf8")

describe("chat model selector sizing", () => {
  it("uses a narrow fixed trigger width with truncated model text", () => {
    expect(source).toContain('className="h-8 w-32 justify-between gap-2 px-3 text-xs"')
    expect(source).toContain('className="min-w-0 flex-1 truncate text-left"')
    expect(source).not.toContain("min-w-[160px]")
    expect(source).not.toContain("max-w-[200px]")
  })
})
