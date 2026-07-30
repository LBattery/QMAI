// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { OutlineMultiAgentRunState } from "@/stores/outline-chat-store"
import { OutlineMultiAgentPanel } from "./outline-multi-agent-panel"

describe("OutlineMultiAgentPanel", () => {
  it("展示多 Agent 总状态、子 Agent 任务、Skill、摘要和回退原因", () => {
    const run: OutlineMultiAgentRunState = {
      mode: "single-agent-fallback",
      status: "fallback",
      maxConcurrency: 3,
      fallbackReason: "多 Agent 失败数量超过阈值：2/3",
      failureDetails: ["题材 Agent：结构化输出 JSON 解析失败"],
      agents: [
        {
          id: "outline-agent",
          name: "大纲 Agent",
          kind: "outline",
          skillNames: ["outline-master-builder"],
          taskPrompt: "负责主线结构、卷纲和章节骨架。",
          status: "done",
          summary: "已完成主线大纲骨架。",
        },
        {
          id: "topic-agent",
          name: "题材 Agent",
          kind: "topic",
          skillNames: ["male-xuanhuan-xianxia"],
          taskPrompt: "负责题材卖点、爽点和读者预期。",
          status: "error",
          error: "结构化输出 JSON 解析失败",
        },
      ],
      merge: {
        status: "skipped",
        summary: "已回退为单 Agent 生成。",
      },
    }

    const html = renderToStaticMarkup(<OutlineMultiAgentPanel run={run} />)

    expect(html).toContain("\u591a Agent \u751f\u6210\u5931\u8d25\uff0c\u5df2\u81ea\u52a8\u5207\u6362\u4e3a\u666e\u901a\u751f\u6210\u3002")
    expect(html).toContain("\u67e5\u770b\u8be6\u60c5")
    expect(html).not.toContain("outline-master-builder")
    expect(html).not.toContain("\u7ed3\u6784\u5316\u8f93\u51fa JSON \u89e3\u6790\u5931\u8d25")
  })
  it("显示等待和重试状态，不显示槽位", () => {
    const run: OutlineMultiAgentRunState = {
      mode: "multi-agent",
      status: "running",
      maxConcurrency: 3,
      agents: [
        {
          id: "waiting-agent",
          name: "人物关系 Agent",
          kind: "character",
          skillNames: ["人物设计"],
          taskPrompt: "等待世界观 Agent 完成",
          status: "waiting",
        },
        {
          id: "retry-agent",
          name: "伏笔审查 Agent",
          kind: "foreshadowing",
          skillNames: ["伏笔审查"],
          taskPrompt: "审查伏笔回收",
          status: "retrying",
          retryCount: 1,
        },
      ],
      merge: { status: "pending" },
    }

    const html = renderToStaticMarkup(<OutlineMultiAgentPanel run={run} />)
    expect(html).toContain("等待中")
    expect(html).toContain("重试中")
    expect(html).toContain("（1/1）")
    expect(html).not.toContain("槽位")
  })
  it("\u5931\u8d25\u56de\u9000\u9ed8\u8ba4\u53ea\u663e\u793a\u7b80\u77ed\u6458\u8981\uff0c\u8be6\u60c5\u539f\u5730\u5c55\u5f00\u4e14\u4e0d\u6cc4\u9732\u5b8c\u6574\u5904\u7406\u5185\u5bb9", async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const run: OutlineMultiAgentRunState = {
      mode: "single-agent-fallback",
      status: "fallback",
      maxConcurrency: 3,
      fallbackReason: "\u591a Agent \u6ca1\u6709\u4efb\u4f55\u6210\u529f\u7ed3\u679c\uff0c\u5df2\u964d\u7ea7\u4e3a\u5355 Agent\u3002\nFALLBACK_REASON_SECRET\n\u5b8c\u6574\u7cfb\u7edf\u63d0\u793a\u8bcd",
      failureDetails: [
        "\u5927\u7eb2 Agent\uff1a\u4e0a\u6e38\u670d\u52a1\u4e0d\u53ef\u7528\nFAILURE_DETAILS_SECRET_A\n\u8bf7\u6c42\u4f53\u79d8\u5bc6",
        "\u5927\u7eb2 Agent\uff1a\u4e0a\u6e38\u670d\u52a1\u4e0d\u53ef\u7528\nFAILURE_DETAILS_SECRET_B",
        "\u9898\u6750 Agent\uff1a\u683c\u5f0f\u9519\u8bef",
        "\u89d2\u8272 Agent\uff1a\u8d85\u65f6",
        "\u8bbe\u5b9a Agent\uff1a\u8d85\u65f6",
        "\u4f0f\u7b14 Agent\uff1a\u8d85\u65f6",
        "\u7b2c\u516d\u9879 Agent\uff1a\u4e0d\u5e94\u5c55\u793a",
      ],
      agents: [{
        id: "outline-agent",
        name: "\u5927\u7eb2 Agent",
        kind: "outline",
        skillNames: ["outline-master-builder"],
        taskPrompt: "\u68b3\u7406\u603b\u7eb2\u4e0e\u7ae0\u8282\u9aa8\u67b6\u3002\n## \u5b8c\u6574\u7cfb\u7edf\u63d0\u793a\u8bcd\n\u4e0d\u5f97\u51fa\u73b0\u5728\u754c\u9762\u4e2d",
        status: "error",
        error: `\u8c03\u7528\u5931\u8d25\uff1a${"\u9519".repeat(200)}\nAGENT_ERROR_SECRET\nAgent \u5b8c\u6574\u5185\u5bb9`,
      }],
      merge: {
        status: "skipped",
        summary: "\u5df2\u56de\u9000\u4e3a\u5355 Agent \u751f\u6210\u3002",
        error: "\u5408\u5e76\u8f93\u51fa\u5931\u8d25\nMERGE_ERROR_SECRET\n\u8bf7\u6c42\u4f53\u5b8c\u6574\u5185\u5bb9",
      },
    }

    await act(async () => root.render(<OutlineMultiAgentPanel run={run} />))
    expect(host.textContent).toContain("\u591a Agent \u751f\u6210\u5931\u8d25\uff0c\u5df2\u81ea\u52a8\u5207\u6362\u4e3a\u666e\u901a\u751f\u6210\u3002")
    expect(host.textContent).not.toContain("\u5927\u7eb2 Agent")
    expect(host.textContent).not.toContain("outline-master-builder")
    expect(host.textContent).not.toContain("\u4e0a\u6e38\u670d\u52a1\u4e0d\u53ef\u7528")
    expect(host.textContent).not.toContain("\u5b8c\u6574\u7cfb\u7edf\u63d0\u793a\u8bcd")
    const toggle = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("\u67e5\u770b\u8be6\u60c5"))
    expect(toggle).toBeDefined()
    expect(toggle?.getAttribute("aria-expanded")).toBe("false")
    expect(toggle?.getAttribute("aria-controls")).toBeNull()
    expect(host.querySelector('[role="region"]')).toBeNull()
    for (const collapsedSecret of [
      "FALLBACK_REASON_SECRET",
      "FAILURE_DETAILS_SECRET_A",
      "AGENT_ERROR_SECRET",
      "MERGE_ERROR_SECRET",
    ]) {
      expect(host.textContent).not.toContain(collapsedSecret)
    }

    await act(async () => toggle?.click())
    expect(toggle?.getAttribute("aria-expanded")).toBe("true")
    const detailsId = toggle?.getAttribute("aria-controls")
    expect(detailsId).toBeTruthy()
    const details = detailsId ? host.querySelector<HTMLElement>(`#${detailsId}`) : null
    expect(details).not.toBeNull()
    expect(details?.getAttribute("role")).toBe("region")
    expect(details?.className).toContain("overflow-y-auto")
    expect(details?.className).toContain("max-h-[min(24rem,55vh)]")
    expect(host.textContent).toContain("Agent \u72b6\u6001")
    expect(host.textContent).toContain("\u5931\u8d25\u539f\u56e0")
    expect(host.textContent).toContain("\u4efb\u52a1\u6458\u8981")
    expect(host.textContent).toContain("Skill")
    expect(host.textContent).toContain("\u5408\u5e76\u72b6\u6001")
    expect(host.textContent).toContain("\u68b3\u7406\u603b\u7eb2\u4e0e\u7ae0\u8282\u9aa8\u67b6\u3002")
    expect(host.textContent).not.toContain("\u5b8c\u6574\u7cfb\u7edf\u63d0\u793a\u8bcd")
    expect(host.textContent).not.toContain("\u4e0d\u5f97\u51fa\u73b0\u5728\u754c\u9762\u4e2d")
    expect(host.textContent).toContain("\u591a Agent \u6ca1\u6709\u4efb\u4f55\u6210\u529f\u7ed3\u679c\uff0c\u5df2\u964d\u7ea7\u4e3a\u5355 Agent\u3002")
    expect(host.textContent).toContain("\u5408\u5e76\u8f93\u51fa\u5931\u8d25")
    expect(host.textContent).toContain("\u9898\u6750 Agent\uff1a\u683c\u5f0f\u9519\u8bef")
    expect(host.textContent).toContain("\u4f0f\u7b14 Agent\uff1a\u8d85\u65f6")
    expect(host.textContent).not.toContain("\u7b2c\u516d\u9879 Agent\uff1a\u4e0d\u5e94\u5c55\u793a")
    expect(host.textContent?.match(/\u5927\u7eb2 Agent\uff1a\u4e0a\u6e38\u670d\u52a1\u4e0d\u53ef\u7528/g)).toHaveLength(1)
    expect(host.textContent).not.toContain("\u9519".repeat(170))
    expect(host.textContent).toContain("...")
    for (const secret of [
      "FALLBACK_REASON_SECRET",
      "FAILURE_DETAILS_SECRET_A",
      "FAILURE_DETAILS_SECRET_B",
      "AGENT_ERROR_SECRET",
      "MERGE_ERROR_SECRET",
      "\u8bf7\u6c42\u4f53\u79d8\u5bc6",
      "\u5b8c\u6574\u7cfb\u7edf\u63d0\u793a\u8bcd",
      "Agent \u5b8c\u6574\u5185\u5bb9",
      "\u8bf7\u6c42\u4f53\u5b8c\u6574\u5185\u5bb9",
    ]) {
      expect(host.textContent).not.toContain(secret)
    }

    await act(async () => root.unmount())
    host.remove()
  })
  it("fallbackReason\u3001failureDetails\u3001agent.error \u548c merge.error \u7edf\u4e00\u8131\u654f\u3001\u53bb\u91cd\u5e76\u9650\u5236\u6761\u6570", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const duplicate = "\u91cd\u590d\u8bca\u65ad\nDUPLICATE_SECRET"
    const run: OutlineMultiAgentRunState = {
      mode: "single-agent-fallback",
      status: "fallback",
      maxConcurrency: 3,
      fallbackReason: "\u603b\u4f53\u56de\u9000\u539f\u56e0\nFALLBACK_SECRET\nSYSTEM_PROMPT_BODY",
      failureDetails: [
        duplicate,
        "\u91cd\u590d\u8bca\u65ad\nSECOND_DUPLICATE_SECRET",
        "\u8bca\u65ad\u4e8c",
        "\u8bca\u65ad\u4e09",
        "\u8bca\u65ad\u56db",
        "\u8bca\u65ad\u4e94",
        "\u8bca\u65ad\u516d\u4e0d\u5e94\u5c55\u793a",
      ],
      agents: [{
        id: "failed-agent",
        name: "\u5931\u8d25 Agent",
        kind: "outline",
        skillNames: ["outline-master-builder"],
        taskPrompt: "\u4efb\u52a1\u6458\u8981\nTASK_BODY_SECRET",
        status: "error",
        error: "Agent \u8c03\u7528\u5931\u8d25\nAGENT_ERROR_SECRET\nAGENT_FULL_CONTENT",
      }],
      merge: {
        status: "error",
        error: "\u5408\u5e76\u5931\u8d25\nMERGE_ERROR_SECRET\nREQUEST_BODY_SECRET",
      },
    }

    await act(async () => root.render(<OutlineMultiAgentPanel run={run} />))
    const toggle = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("\u67e5\u770b\u8be6\u60c5"))
    await act(async () => toggle?.click())

    expect(host.textContent).toContain("\u603b\u4f53\u56de\u9000\u539f\u56e0")
    expect(host.textContent).toContain("Agent \u8c03\u7528\u5931\u8d25")
    expect(host.textContent).toContain("\u5408\u5e76\u5931\u8d25")
    expect(host.textContent?.match(/\u91cd\u590d\u8bca\u65ad/g)).toHaveLength(1)
    expect(host.textContent).not.toContain("\u8bca\u65ad\u516d\u4e0d\u5e94\u5c55\u793a")
    for (const secret of [
      "FALLBACK_SECRET",
      "SYSTEM_PROMPT_BODY",
      "DUPLICATE_SECRET",
      "SECOND_DUPLICATE_SECRET",
      "TASK_BODY_SECRET",
      "AGENT_ERROR_SECRET",
      "AGENT_FULL_CONTENT",
      "MERGE_ERROR_SECRET",
      "REQUEST_BODY_SECRET",
    ]) {
      expect(host.textContent).not.toContain(secret)
    }

    await act(async () => root.unmount())
    host.remove()
  })
  it("\u975e\u56de\u9000\u9762\u677f\u4e5f\u4e0d\u80fd\u7ed5\u8fc7\u7edf\u4e00\u8bca\u65ad\u8131\u654f", () => {
    const run: OutlineMultiAgentRunState = {
      mode: "multi-agent",
      status: "done",
      maxConcurrency: 2,
      fallbackReason: "\u517c\u5bb9\u56de\u9000\u539f\u56e0\nNORMAL_FALLBACK_SECRET",
      failureDetails: [
        "\u91cd\u590d\u5931\u8d25\nNORMAL_DETAIL_SECRET_A",
        "\u91cd\u590d\u5931\u8d25\nNORMAL_DETAIL_SECRET_B",
      ],
      agents: [{
        id: "normal-agent",
        name: "\u666e\u901a Agent",
        kind: "outline",
        skillNames: ["outline-master-builder"],
        taskPrompt: "\u666e\u901a\u4efb\u52a1\u6458\u8981\nNORMAL_TASK_SECRET",
        status: "error",
        summary: "\u5904\u7406\u6458\u8981\nNORMAL_SUMMARY_SECRET",
        error: "\u666e\u901a Agent \u5931\u8d25\nNORMAL_AGENT_ERROR_SECRET",
      }],
      merge: {
        status: "error",
        summary: "\u5408\u5e76\u6458\u8981\nNORMAL_MERGE_SUMMARY_SECRET",
        error: "\u5408\u5e76\u8bca\u65ad\u5931\u8d25\nNORMAL_MERGE_ERROR_SECRET",
      },
    }

    const html = renderToStaticMarkup(<OutlineMultiAgentPanel run={run} />)

    expect(html).toContain("\u666e\u901a Agent \u5931\u8d25")
    expect(html).toContain("\u5408\u5e76\u8bca\u65ad\u5931\u8d25")
    expect(html.match(/\u91cd\u590d\u5931\u8d25/g)).toHaveLength(1)
    for (const secret of [
      "NORMAL_FALLBACK_SECRET",
      "NORMAL_DETAIL_SECRET_A",
      "NORMAL_DETAIL_SECRET_B",
      "NORMAL_TASK_SECRET",
      "NORMAL_SUMMARY_SECRET",
      "NORMAL_AGENT_ERROR_SECRET",
      "NORMAL_MERGE_SUMMARY_SECRET",
      "NORMAL_MERGE_ERROR_SECRET",
    ]) {
      expect(html).not.toContain(secret)
    }
  })
  it("\u8bca\u65ad\u6458\u8981\u652f\u6301\u56db\u79cd\u6362\u884c\u5206\u9694\u5e76\u63a9\u7801\u5355\u884c\u51ed\u636e\u4e0e URL query \u51ed\u636e", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const run: OutlineMultiAgentRunState = {
      mode: "single-agent-fallback",
      status: "fallback",
      maxConcurrency: 2,
      fallbackReason: "Authorization: Bearer auth-secret\rFALLBACK_CR_BODY",
      failureDetails: [
        "URL https://example.test/path?api_key=query-key&token=query-token&safe=1\nFAILURE_LF_BODY",
        "API key: api-key-value\u2028FAILURE_LS_BODY",
        "token=token-value\u2029FAILURE_PS_BODY",
        "password: pass-value secret=secret-value\rFAILURE_CR_BODY",
      ],
      agents: [{
        id: "credential-agent",
        name: "\u51ed\u636e Agent",
        kind: "outline",
        skillNames: [],
        taskPrompt: "\u4efb\u52a1\u6458\u8981",
        status: "error",
        error: "Bearer agent-bearer\u2028AGENT_LS_BODY",
      }],
      merge: {
        status: "error",
        error: "Authorization=merge-authorization\u2029MERGE_PS_BODY",
      },
    }

    await act(async () => root.render(<OutlineMultiAgentPanel run={run} />))
    const toggle = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("\u67e5\u770b\u8be6\u60c5"))
    await act(async () => toggle?.click())

    expect(host.textContent).toContain("Authorization: Bearer ***")
    expect(host.textContent).toContain("api_key=***")
    expect(host.textContent).toContain("token=***")
    expect(host.textContent).toContain("safe=1")
    expect(host.textContent).toContain("API key: ***")
    expect(host.textContent).toContain("password: ***")
    expect(host.textContent).toContain("secret=***")
    expect(host.textContent).toContain("Bearer ***")
    for (const hidden of [
      "auth-secret",
      "query-key",
      "query-token",
      "api-key-value",
      "token-value",
      "pass-value",
      "secret-value",
      "agent-bearer",
      "merge-authorization",
      "FALLBACK_CR_BODY",
      "FAILURE_LF_BODY",
      "FAILURE_LS_BODY",
      "FAILURE_PS_BODY",
      "FAILURE_CR_BODY",
      "AGENT_LS_BODY",
      "MERGE_PS_BODY",
    ]) {
      expect(host.textContent).not.toContain(hidden)
    }

    await act(async () => root.unmount())
    host.remove()
  })

})
