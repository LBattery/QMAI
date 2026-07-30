import { describe, expect, it } from "vitest"
import {
  buildOutlineNodeWriteContent,
  validateOutlineWriteTarget,
} from "./write-outline-node"

describe("write-outline-node helpers", () => {
  it("保留已经带标题的完整 Markdown 内容", () => {
    const content = buildOutlineNodeWriteContent("第1章", "# 章纲（第001章）\n\n正文")

    expect(content).toBe("# 章纲（第001章）\n\n正文\n")
  })

  it("为节点内容补充二级标题", () => {
    const content = buildOutlineNodeWriteContent("第1章", "正文")

    expect(content).toBe("## 第1章\n\n正文\n")
  })

  it("将结构化 JSON 节点内容转换为可阅读 Markdown，避免把 JSON 原文写入大纲", () => {
    const content = buildOutlineNodeWriteContent(
      "白莲教圣公",
      JSON.stringify({
        角色名: "白莲教圣公",
        定位: "第二方势力首领",
        核心目标: ["夺取龙脉", "逼主角暴露底牌"],
        关系: {
          主角: "表面合作，暗中试探",
          反派: "互相利用",
        },
      }),
    )

    expect(content).toContain("## 白莲教圣公")
    expect(content).toContain("### 核心目标")
    expect(content).toContain("- 夺取龙脉")
    expect(content).toContain("### 关系")
    expect(content).toContain("- 主角：表面合作，暗中试探")
    expect(content.trim()).not.toMatch(/^\{/)
  })

  it("拒绝不安全的大纲写入目标", () => {
    expect(validateOutlineWriteTarget("../章纲.md")).toContain("上级目录")
    expect(validateOutlineWriteTarget("C:/Book/章纲.md")).toContain("绝对路径")
    expect(validateOutlineWriteTarget("章纲.txt")).toContain("Markdown")
    expect(validateOutlineWriteTarget("章纲/章纲-第001章.md")).toBeNull()
  })
})
