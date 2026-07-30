import { describe, expect, it } from "vitest"
import {
  canTransitionOutlineWorkflow,
  createInitialOutlineWorkflowState,
  transitionOutlineWorkflow,
  type OutlineWorkflowStage,
} from "./outline-workflow-state"

describe("AI大纲工作流状态机", () => {
  it("按固定顺序推进多 Agent 大纲生成流程", () => {
    const stages: OutlineWorkflowStage[] = [
      "collecting_requirements",
      "sufficiency_check",
      "generation_plan",
      "waiting_user_confirm",
      "multi_agent_planning",
      "running_subagents",
      "merging_results",
      "quality_check",
      "preview",
      "waiting_save_confirm",
      "saved",
    ]

    let state = createInitialOutlineWorkflowState()
    expect(state.stage).toBe("idle")

    for (const stage of stages) {
      expect(canTransitionOutlineWorkflow(state.stage, stage)).toBe(true)
      state = transitionOutlineWorkflow(state, stage)
      expect(state.stage).toBe(stage)
    }
  })

  it("禁止用户确认前直接进入多 Agent 执行或保存", () => {
    const state = createInitialOutlineWorkflowState()

    expect(canTransitionOutlineWorkflow(state.stage, "running_subagents")).toBe(false)
    expect(canTransitionOutlineWorkflow("generation_plan", "running_subagents")).toBe(false)
    expect(canTransitionOutlineWorkflow("quality_check", "saved")).toBe(false)
  })

  it("支持质量检查失败后进入自动修复再回到质量检查", () => {
    expect(canTransitionOutlineWorkflow("quality_check", "auto_repair")).toBe(true)
    expect(canTransitionOutlineWorkflow("auto_repair", "quality_check")).toBe(true)
  })
})
