import { isTauri } from "@/lib/platform"
import type { NovelTaskIntent } from "@/lib/novel/task-router"

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>

export interface WritingWakeLockBindings {
  isTauri: () => boolean
  invoke: TauriInvoke
  warn: (message: string, error: unknown) => void
}

const WRITING_WAKE_LOCK_INTENTS = new Set<NovelTaskIntent>([
  "write_chapter",
  "continue_chapter",
  "rewrite_chapter",
  "polish_chapter",
])

const defaultBindings: WritingWakeLockBindings = {
  isTauri,
  invoke: async <T>(command: string, args?: Record<string, unknown>) => {
    const { invoke } = await import("@tauri-apps/api/core")
    return invoke<T>(command, args)
  },
  warn: (message, error) => console.warn(message, error),
}

export function shouldKeepAwakeForWriting(options: {
  novelMode: boolean
  intent?: NovelTaskIntent | null
  planExecuteActive: boolean
}): boolean {
  return options.novelMode
    && !options.planExecuteActive
    && !!options.intent
    && WRITING_WAKE_LOCK_INTENTS.has(options.intent)
}

export async function withWritingWakeLock<T>(
  enabled: boolean,
  operation: () => Promise<T>,
  bindings: WritingWakeLockBindings = defaultBindings,
): Promise<T> {
  if (!enabled || !bindings.isTauri()) {
    return operation()
  }

  let token: string | null = null
  try {
    token = await bindings.invoke<string>("acquire_writing_wake_lock")
  } catch (error) {
    bindings.warn("[writing-wake-lock] 启用失败，继续执行正文生成", error)
  }

  try {
    return await operation()
  } finally {
    if (token) {
      try {
        await bindings.invoke<void>("release_writing_wake_lock", { token })
      } catch (error) {
        bindings.warn("[writing-wake-lock] 释放失败，将在应用退出时清理", error)
      }
    }
  }
}
