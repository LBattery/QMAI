import { invoke } from "@tauri-apps/api/core"
import type { LlmConfig } from "@/stores/wiki-store"
import { isTauri } from "@/lib/platform"

export interface LocalCliDetectResult {
  installed: boolean
  version: string | null
  path: string | null
  model?: string | null
  error: string | null
}

function detectCommand(provider: LlmConfig["provider"]): "claude_cli_detect" | "codex_cli_detect" | null {
  if (provider === "claude-code") return "claude_cli_detect"
  if (provider === "codex-cli") return "codex_cli_detect"
  return null
}

export async function detectLocalCliConfig(provider: LlmConfig["provider"]): Promise<LocalCliDetectResult | null> {
  const command = detectCommand(provider)
  if (!command) return null
  if (typeof window !== "undefined" && !isTauri()) {
    return {
      installed: false,
      version: null,
      path: null,
      model: null,
      error: "本地 CLI 模型仅桌面版支持。Web 版请使用 OpenAI/Anthropic/Gemini/Ollama 或自定义 HTTP 接口。",
    }
  }
  return invoke<LocalCliDetectResult>(command)
}

export async function resolveRuntimeLocalCliConfig(config: LlmConfig): Promise<LlmConfig> {
  if (config.provider !== "claude-code" && config.provider !== "codex-cli") {
    return config
  }

  try {
    const detected = await detectLocalCliConfig(config.provider)
    const detectedModel = detected?.model?.trim() ?? ""
    if (!detectedModel) return config
    return { ...config, model: detectedModel }
  } catch {
    return config
  }
}
