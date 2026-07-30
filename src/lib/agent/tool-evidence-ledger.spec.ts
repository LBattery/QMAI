import { describe, expect, it } from "vitest"
import { ToolEvidenceLedger } from "./tool-evidence-ledger"

describe("ToolEvidenceLedger", () => {
  it("相同工具、参数和结果再次出现时返回证据引用", () => {
    const ledger = new ToolEvidenceLedger(500)
    const first = ledger.format("read_chapter", { chapter: 1 }, "第一章完整内容")
    const second = ledger.format("read_chapter", { chapter: 1 }, "第一章完整内容")

    expect(first).toContain("第一章完整内容")
    expect(second).toContain("工具证据引用")
    expect(second).not.toContain("第一章完整内容")
  })

  it("不同参数不会错误复用证据", () => {
    const ledger = new ToolEvidenceLedger(500)
    ledger.format("read_chapter", { chapter: 1 }, "第一章")

    expect(ledger.format("read_chapter", { chapter: 2 }, "第二章")).toContain("第二章")
  })
})
