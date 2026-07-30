import { describe, expect, it } from "vitest"
import {
  buildOutlineGenerationQualityFeedback,
  extractChapterOutlineStatus,
  formatChapterOutlineQualityReport,
  isLikelyChapterOutline,
  runChapterOutlineQualityCheck,
  summarizeChapterOutlineQuality,
} from "./outline-quality-check"
import { getChapterOutlineTemplate } from "./outline-templates"

describe("章纲质量检查", () => {
  it("完整章纲模板应通过关键质量检查", () => {
    const content = getChapterOutlineTemplate(1, "账号交接")
    const summary = summarizeChapterOutlineQuality(content)

    expect(summary.valid).toBe(true)
    expect(summary.errors).toEqual([])
    expect(summary.items.some((item) => item.category === "核心事件" && item.status === "pass")).toBe(true)
    expect(summary.items.some((item) => item.category === "场景顺序" && item.status === "pass")).toBe(true)
  })

  it("核心事件不足应返回错误", () => {
    const content = getChapterOutlineTemplate(1, "账号交接").replace(
      /- 事件3：[\s\S]*?- 事件6：[\s\S]*?(?=\n\n## 场景顺序)/,
      "",
    )
    const result = runChapterOutlineQualityCheck(content)

    expect(result.find((item) => item.category === "核心事件")?.status).toBe("error")
    expect(result.find((item) => item.category === "核心事件")?.details?.join("\n")).toContain("至少需要 6 条")
  })

  it("缺少 CBN、CPNs、CEN 结构节点应返回错误", () => {
    const content = getChapterOutlineTemplate(1, "账号交接")
      .replace(/## 结构节点[\s\S]*?(?=\n\n## 章首钩子)/, "")
    const result = runChapterOutlineQualityCheck(content)

    expect(result.find((item) => item.category === "结构节点")?.status).toBe("error")
    expect(result.find((item) => item.category === "结构节点")?.details?.join("\n")).toContain("CBN")
    expect(result.find((item) => item.category === "结构节点")?.details?.join("\n")).toContain("CPNs")
    expect(result.find((item) => item.category === "结构节点")?.details?.join("\n")).toContain("CEN")
  })

  it("缺少时间锚点、章内时间跨度和与上章时间差应返回错误", () => {
    const content = getChapterOutlineTemplate(1, "账号交接")
      .replace("- 时间锚点：", "")
      .replace("- 章内时间跨度：", "")
      .replace("- 与上章时间差：", "")
    const result = runChapterOutlineQualityCheck(content)

    expect(result.find((item) => item.category === "时间承接")?.status).toBe("error")
    expect(result.find((item) => item.category === "时间承接")?.details?.join("\n")).toContain("时间锚点")
    expect(result.find((item) => item.category === "时间承接")?.details?.join("\n")).toContain("章内时间跨度")
    expect(result.find((item) => item.category === "时间承接")?.details?.join("\n")).toContain("与上章时间差")
  })

  it("缺少必须覆盖节点和本章禁区应返回错误", () => {
    const content = getChapterOutlineTemplate(1, "账号交接")
      .replace(/## 执行约束[\s\S]*?(?=\n\n## 人物状态)/, "")
    const result = runChapterOutlineQualityCheck(content)

    expect(result.find((item) => item.category === "执行约束")?.status).toBe("error")
    expect(result.find((item) => item.category === "执行约束")?.details?.join("\n")).toContain("必须覆盖节点")
    expect(result.find((item) => item.category === "执行约束")?.details?.join("\n")).toContain("本章禁区")
  })

  it("能识别章纲和当前状态", () => {
    const content = getChapterOutlineTemplate(12, "反转")

    expect(isLikelyChapterOutline(content, "章纲-第012章.md")).toBe(true)
    expect(extractChapterOutlineStatus(content)).toBe("草稿")
    expect(extractChapterOutlineStatus(content.replace("当前状态：草稿", "当前状态：已确认"))).toBe("已确认")
  })

  it("质量报告应给出可执行的章纲补全建议", () => {
    const summary = summarizeChapterOutlineQuality("# 章纲-第001章\n\n## 核心事件\n\n- 事件1：只有一个事件")
    const report = formatChapterOutlineQualityReport(summary, {
      maxIssues: 3,
      includeWarnings: true,
    })

    expect(report).toContain("章纲质量检查未通过")
    expect(report).toContain("项错误")
    expect(report).toContain("主要缺失")
    expect(report).toContain("另有")
    expect(report).toContain("请让 AI 按章纲标准补齐后重新输出完整章纲，再保存")
  })

  it("通过但存在提醒时应提示继续完善提醒项", () => {
    const report = formatChapterOutlineQualityReport({
      valid: true,
      errors: [],
      warnings: ["人物状态缺少「关键配角状态」字段"],
      items: [],
    })

    expect(report).toBe("章纲质量检查通过，但有 1 项提醒。建议完善：人物状态缺少「关键配角状态」字段。")
  })

  it("生成后质量检查应给不完整章纲返回可修复项和修订提示", () => {
    const feedback = buildOutlineGenerationQualityFeedback({
      fileType: "chapter-outline",
      fileName: "章纲-第001章.md",
      content: "# 章纲-第001章\n\n## 核心事件\n\n- 事件1：只有一个事件",
    })

    expect(feedback).not.toBeNull()
    expect(feedback?.status).toBe("error")
    expect(feedback?.title).toBe("生成后质量检查")
    expect(feedback?.summary).toContain("可修复项")
    expect(feedback?.repairPrompt).toContain("请按章纲标准修订")
    expect(feedback?.repairPrompt).toContain("章纲-第001章.md")
  })
})
