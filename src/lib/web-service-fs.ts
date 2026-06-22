import type { FileNode } from "@/types/wiki"

interface ApiResponse {
  ok: boolean
  error?: string
  project?: { name: string; path: string }
  nodes?: FileNode[]
  contents?: string
  copied?: string[]
  exists?: boolean
  mtimeMs?: number
  size?: number
  md5?: string
  base64?: string
  mimeType?: string
  executableDir?: string
  resourceDir?: string
  appState?: Record<string, unknown> | null
  sourcePath?: string | null
}

function getWebApiBaseUrl(): string {
  const configured = import.meta.env.VITE_QMAI_WEB_API as string | undefined
  if (configured?.trim()) return configured.replace(/\/$/, "")
  if (typeof window !== "undefined" && window.location.port === "1420") {
    return "http://127.0.0.1:3217"
  }
  if (typeof window !== "undefined") return window.location.origin
  return "http://127.0.0.1:3217"
}

async function api(route: string, payload: Record<string, unknown> = {}): Promise<ApiResponse> {
  let response: Response
  try {
    response = await fetch(`${getWebApiBaseUrl()}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    throw new Error(
      `本地 Web 服务未启动或不可访问。请使用 npm.cmd run web:dev 启动后再打开项目。${err instanceof Error ? ` (${err.message})` : ""}`,
    )
  }
  const data = await response.json().catch(() => ({ ok: false, error: response.statusText })) as ApiResponse
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Web API ${route} failed`)
  }
  return data
}

export function webAssetUrl(path: string): string {
  return `${getWebApiBaseUrl()}/api/fs/asset?path=${encodeURIComponent(path)}`
}

export async function loadLegacyTauriAppState(): Promise<{
  appState: Record<string, unknown> | null
  sourcePath: string | null
}> {
  const result = await api("/api/legacy/tauri-state")
  return {
    appState: result.appState ?? null,
    sourcePath: result.sourcePath ?? null,
  }
}

export const webServiceFs = {
  async readFile(path: string): Promise<string> {
    return (await api("/api/fs/read", { path })).contents ?? ""
  },
  async writeFile(path: string, contents: string): Promise<void> {
    await api("/api/fs/write", { path, contents })
  },
  async listDirectory(path: string): Promise<FileNode[]> {
    return (await api("/api/fs/list", { path })).nodes ?? []
  },
  async createDirectory(path: string): Promise<void> {
    await api("/api/fs/mkdir", { path })
  },
  async copyFile(source: string, destination: string): Promise<void> {
    await api("/api/fs/copy-file", { source, destination })
  },
  async copyDirectory(source: string, destination: string): Promise<string[]> {
    return (await api("/api/fs/copy-dir", { source, destination })).copied ?? []
  },
  async deleteFile(path: string): Promise<void> {
    await api("/api/fs/delete-file", { path })
  },
  async fileExists(path: string): Promise<boolean> {
    return (await api("/api/fs/exists", { path })).exists ?? false
  },
  async getFileModifiedTime(path: string): Promise<number> {
    return (await api("/api/fs/stat", { path })).mtimeMs ?? Date.now()
  },
  async getFileSize(path: string): Promise<number> {
    return (await api("/api/fs/stat", { path })).size ?? 0
  },
  async getFileMd5(path: string): Promise<string> {
    return (await api("/api/fs/md5", { path })).md5 ?? ""
  },
  async readFileAsBase64(path: string): Promise<{ base64: string; mimeType: string }> {
    const result = await api("/api/fs/read-base64", { path })
    return { base64: result.base64 ?? "", mimeType: result.mimeType ?? "application/octet-stream" }
  },
  async createProject(name: string, path: string): Promise<{ name: string; path: string }> {
    const result = await api("/api/project/create", { name, path })
    if (!result.project) throw new Error("Web API did not return a project")
    return result.project
  },
  async openProject(path: string): Promise<{ name: string; path: string }> {
    const result = await api("/api/project/open", { path })
    if (!result.project) throw new Error("Web API did not return a project")
    return result.project
  },
  async getExecutableDir(): Promise<string> {
    return (await api("/api/system/paths")).executableDir ?? ""
  },
  async getResourceDir(): Promise<string> {
    return (await api("/api/system/paths")).resourceDir ?? ""
  },
}
