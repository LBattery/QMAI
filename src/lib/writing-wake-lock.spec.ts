import { describe, expect, it, vi } from "vitest"
import {
  shouldKeepAwakeForWriting,
  withWritingWakeLock,
  type WritingWakeLockBindings,
} from "./writing-wake-lock"

function bindings(invoke: WritingWakeLockBindings["invoke"], tauri = true) {
  return {
    isTauri: () => tauri,
    invoke,
    warn: vi.fn(),
  } satisfies WritingWakeLockBindings
}

describe("shouldKeepAwakeForWriting", () => {
  it.each(["write_chapter", "continue_chapter", "rewrite_chapter", "polish_chapter"] as const)(
    "enables the wake lock for %s",
    (intent) => {
      expect(shouldKeepAwakeForWriting({ novelMode: true, intent, planExecuteActive: false })).toBe(true)
    },
  )

  it.each(["general_chat", "generate_outline", "review_chapter", "lint_chapter"] as const)(
    "does not enable the wake lock for %s",
    (intent) => {
      expect(shouldKeepAwakeForWriting({ novelMode: true, intent, planExecuteActive: false })).toBe(false)
    },
  )

  it("does not enable the wake lock while waiting for plan execution", () => {
    expect(shouldKeepAwakeForWriting({
      novelMode: true,
      intent: "write_chapter",
      planExecuteActive: true,
    })).toBe(false)
  })
})

describe("withWritingWakeLock", () => {
  it("acquires before the operation and releases after it completes", async () => {
    const events: string[] = []
    const invoke = vi.fn(async <T>(command: string) => {
      events.push(command)
      return (command === "acquire_writing_wake_lock" ? "token-1" : undefined) as T
    })

    const result = await withWritingWakeLock(true, async () => {
      events.push("operation")
      return "正文"
    }, bindings(invoke))

    expect(result).toBe("正文")
    expect(events).toEqual([
      "acquire_writing_wake_lock",
      "operation",
      "release_writing_wake_lock",
    ])
    expect(invoke).toHaveBeenLastCalledWith("release_writing_wake_lock", { token: "token-1" })
  })

  it("releases after an aborted or failed operation and preserves the original error", async () => {
    const abortError = new DOMException("cancelled", "AbortError")
    const invoke = vi.fn(async <T>(command: string) => {
      if (command === "release_writing_wake_lock") throw new Error("release failed")
      return "token-abort" as T
    })
    const testBindings = bindings(invoke)

    await expect(withWritingWakeLock(true, async () => {
      throw abortError
    }, testBindings)).rejects.toBe(abortError)

    expect(invoke).toHaveBeenLastCalledWith("release_writing_wake_lock", { token: "token-abort" })
    expect(testBindings.warn).toHaveBeenCalledTimes(1)
  })

  it("continues generation when acquisition fails", async () => {
    const invoke = vi.fn(async <T>() => {
      throw new Error("unsupported")
    })
    const testBindings = bindings(invoke)

    await expect(withWritingWakeLock(true, async () => "正文", testBindings)).resolves.toBe("正文")
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(testBindings.warn).toHaveBeenCalledTimes(1)
  })

  it("does not let a release failure mask the operation result", async () => {
    const invoke = vi.fn(async <T>(command: string) => {
      if (command === "release_writing_wake_lock") throw new Error("release failed")
      return "token-release" as T
    })
    const testBindings = bindings(invoke)

    await expect(withWritingWakeLock(true, async () => "正文", testBindings)).resolves.toBe("正文")
    expect(testBindings.warn).toHaveBeenCalledTimes(1)
  })

  it("is a no-op outside Tauri or when disabled", async () => {
    const invoke = vi.fn()

    await expect(withWritingWakeLock(true, async () => "browser", bindings(invoke, false))).resolves.toBe("browser")
    await expect(withWritingWakeLock(false, async () => "disabled", bindings(invoke))).resolves.toBe("disabled")
    expect(invoke).not.toHaveBeenCalled()
  })
})
