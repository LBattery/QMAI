type NavigatorWithClientHints = Navigator & {
  userAgentData?: { platform?: string }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false
  const hinted = (navigator as NavigatorWithClientHints).userAgentData?.platform
  if (hinted) return hinted === "macOS"
  return /Mac/i.test(navigator.platform) || /Macintosh|Mac OS X/i.test(navigator.userAgent)
}

export async function pickDirectory(): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择文件夹",
    })
    return selected ?? null
  }

  // 浏览器的目录选择器只能拿到文件夹名，本地 Web 服务需要绝对路径才能读写，
  // 所以 Web 版直接询问绝对路径，避免选出来的目录被当成服务端相对路径而打开失败。
  const input = window.prompt("请输入文件夹的完整路径（例如 D:\\QM-BOOK\\我的小说）：")
  return input?.trim() || null
}
