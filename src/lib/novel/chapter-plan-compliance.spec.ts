import { describe, expect, it, vi } from "vitest"
import type { LlmConfig } from "@/stores/wiki-store"
import {
  buildChapterPlanCompliancePrompt,
  buildChapterPlanDeviationRepairPrompt,
  parseChapterPlanComplianceResult,
  runChapterPlanComplianceCheck,
  shouldRepairChapterPlanDeviation,
} from "./chapter-plan-compliance"

const streamChatMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/llm-client", () => ({
  streamChat: streamChatMock,
}))

const llmConfig: LlmConfig = {
  provider: "custom",
  apiKey: "test-key",
  model: "test-model",
  ollamaUrl: "",
  customEndpoint: "https://example.test/v1",
  maxContextSize: 120000,
}

describe("chapter-plan-compliance", () => {
  it("builds a prompt that compares final content against the confirmed plan", () => {
    const prompt = buildChapterPlanCompliancePrompt("确认计划", "最终正文")

    expect(prompt).toContain("计划履约度检查")
    expect(prompt).toContain("确认计划")
    expect(prompt).not.toContain("蓝图")
    expect(prompt).toContain("最终正文")
    expect(prompt).toContain("场景序列")
    expect(prompt).toContain("伏笔动作")
    expect(prompt).toContain("爽点/期待点")
    expect(prompt).toContain("场景戏剧功能")
    expect(prompt).toContain("对话目标")
    expect(prompt).toContain("水文")
    expect(prompt).toContain("开头和结尾")
    expect(prompt).toContain("JSON")
    expect(prompt.length).toBeLessThan(900)
  })

  it("keeps both chapter opening and ending when final content is long", () => {
    const longContent = [
      "开头承接上一章门缝声。",
      "中段推进。".repeat(7000),
      "结尾出现门外第二个人影。",
    ].join("\n")

    const prompt = buildChapterPlanCompliancePrompt("确认计划", longContent)

    expect(prompt).toContain("开头承接上一章门缝声")
    expect(prompt).toContain("结尾出现门外第二个人影")
    expect(prompt).toContain("正文中段已截断")
    expect(prompt.length).toBeLessThan(13000)
  })

  it("parses structured compliance JSON and marks clear deviations for repair", () => {
    const parsed = parseChapterPlanComplianceResult(JSON.stringify({
      status: "partial_deviation",
      summary: "旧屋揭示完成，但结尾钩子缺失。",
      deviations: [{
        point: "结尾钩子",
        evidence: "正文停在解释线索，没有门外脚步声。",
        suggestion: "补入门外第二个人影，导向下一章。",
      }],
    }))

    expect(parsed.status).toBe("partial_deviation")
    expect(parsed.summary).toContain("结尾钩子缺失")
    expect(parsed.deviations).toEqual([{
      point: "结尾钩子",
      evidence: "正文停在解释线索，没有门外脚步声。",
      suggestion: "补入门外第二个人影，导向下一章。",
    }])
    expect(shouldRepairChapterPlanDeviation(parsed)).toBe(true)
  })

  it("parses legacy text compliance results without forcing repair for mostly compliant chapters", () => {
    const parsed = parseChapterPlanComplianceResult([
      "履约度：基本符合",
      "偏离点：轻微缺少环境回声。",
      "正文证据：旧屋内部描写偏少。",
      "建议修正：可不返修。",
    ].join("\n"))

    expect(parsed.status).toBe("mostly_compliant")
    expect(parsed.deviations[0]?.point).toBe("轻微缺少环境回声。")
    expect(shouldRepairChapterPlanDeviation(parsed)).toBe(false)
  })

  it("builds a lightweight repair prompt that only patches deviation points", () => {
    const prompt = buildChapterPlanDeviationRepairPrompt(
      "计划摘要：旧屋揭示，结尾必须出现门外第二个人影。",
      "最终正文：主角读完旧信后结束。",
      {
        status: "clear_deviation",
        summary: "明显偏离：结尾钩子缺失。",
        deviations: [{
          point: "章末钩子",
          evidence: "正文没有第二个人影。",
          suggestion: "只在结尾补入门外第二个人影。",
        }],
        rawText: "",
      },
    )

    expect(prompt).toContain("只修复偏离点，不重写全章")
    expect(prompt).toContain("计划摘要")
    expect(prompt).toContain("章末钩子")
    expect(prompt).toContain("最终正文")
    expect(prompt.length).toBeLessThan(13500)
  })

  it("runs the compliance model call and returns streamed text", async () => {
    streamChatMock.mockImplementationOnce(async (_config, messages, callbacks) => {
      expect(messages[0].content).toContain("计划履约度检查")
      callbacks.onToken("履约度：基本符合")
      callbacks.onDone()
    })

    await expect(runChapterPlanComplianceCheck(llmConfig, "确认计划", "最终正文"))
      .resolves.toBe("履约度：基本符合")
  })

  it("forwards the stop signal to the compliance model call", async () => {
    const controller = new AbortController()
    streamChatMock.mockImplementationOnce(async (_config, _messages, callbacks) => {
      callbacks.onToken("履约度：符合")
      callbacks.onDone()
    })

    await runChapterPlanComplianceCheck(llmConfig, "确认计划", "最终正文", controller.signal)

    expect(streamChatMock).toHaveBeenCalledWith(
      llmConfig,
      expect.any(Array),
      expect.any(Object),
      controller.signal,
    )
  })
})
