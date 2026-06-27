import { webServiceFs } from "@/lib/web-service-fs"
import type { FileNode } from "@/types/wiki"

interface WebFileSystemLike {
  readFile(path: string): Promise<string>
  writeFile(path: string, contents: string): Promise<void>
  writeFileAtomic(path: string, contents: string): Promise<void>
  listDirectory(path: string): Promise<FileNode[]>
  createDirectory(path: string): Promise<void>
  deleteFile(path: string): Promise<void>
  fileExists(path: string): Promise<boolean>
  getFileModifiedTime(path: string): Promise<number>
  getFileSize(path: string): Promise<number>
  getFileMd5(path: string): Promise<string>
  copyFile(source: string, destination: string): Promise<void>
  copyDirectory(source: string, destination: string): Promise<string[]>
  preprocessFile(path: string): Promise<string>
  findRelatedWikiPages(projectPath: string, sourceName: string): Promise<string[]>
  readFileAsBase64(path: string): Promise<{ base64: string; mimeType: string }>
  openProjectFolder(path: string): Promise<void>
  clipServerStatus(): Promise<string>
  getExecutableDir(): Promise<string>
  getResourceDir(): Promise<string>
  createProject(name: string, path: string): Promise<{ name: string; path: string }>
  openProject(path: string): Promise<{ name: string; path: string }>
  initProjectWithTemplate(projectPath: string, template: { schema: string; purpose: string; extraDirs: string[] }): void
}

function normalizeFsPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+/g, "/")
  if (normalized === "/") return normalized
  return normalized.replace(/\/$/, "")
}

function parentPath(path: string): string {
  const normalized = normalizeFsPath(path)
  const idx = normalized.lastIndexOf("/")
  if (idx <= 0) return "/"
  return normalized.slice(0, idx)
}

function baseName(path: string): string {
  const normalized = normalizeFsPath(path)
  return normalized.split("/").filter(Boolean).pop() ?? normalized
}

class HttpWebFileSystem implements WebFileSystemLike {
  async readFile(path: string): Promise<string> {
    return webServiceFs.readFile(path)
  }

  async writeFile(path: string, contents: string): Promise<void> {
    return webServiceFs.writeFile(path, contents)
  }

  async writeFileAtomic(path: string, contents: string): Promise<void> {
    return webServiceFs.writeFile(path, contents)
  }

  async listDirectory(path: string): Promise<FileNode[]> {
    return webServiceFs.listDirectory(path)
  }

  async createDirectory(path: string): Promise<void> {
    return webServiceFs.createDirectory(path)
  }

  async deleteFile(path: string): Promise<void> {
    return webServiceFs.deleteFile(path)
  }

  async fileExists(path: string): Promise<boolean> {
    return webServiceFs.fileExists(path)
  }

  async getFileModifiedTime(path: string): Promise<number> {
    return webServiceFs.getFileModifiedTime(path)
  }

  async getFileSize(path: string): Promise<number> {
    return webServiceFs.getFileSize(path)
  }

  async getFileMd5(path: string): Promise<string> {
    return webServiceFs.getFileMd5(path)
  }

  async copyFile(source: string, destination: string): Promise<void> {
    return webServiceFs.copyFile(source, destination)
  }

  async copyDirectory(source: string, destination: string): Promise<string[]> {
    return webServiceFs.copyDirectory(source, destination)
  }

  async preprocessFile(path: string): Promise<string> {
    return webServiceFs.readFile(path)
  }

  async findRelatedWikiPages(projectPath: string, sourceName: string): Promise<string[]> {
    void projectPath
    void sourceName
    return []
  }

  async readFileAsBase64(path: string): Promise<{ base64: string; mimeType: string }> {
    return webServiceFs.readFileAsBase64(path)
  }

  async openProjectFolder(_path: string): Promise<void> {
    // Browser mode cannot reveal local folders without the full native bridge.
  }

  async clipServerStatus(): Promise<string> {
    const { httpClip } = await import("@/lib/http-adapter")
    return httpClip.status()
  }

  async getExecutableDir(): Promise<string> {
    return webServiceFs.getExecutableDir()
  }

  async getResourceDir(): Promise<string> {
    return webServiceFs.getResourceDir()
  }

  async createProject(name: string, path: string): Promise<{ name: string; path: string }> {
    return webServiceFs.createProject(name, path)
  }

  async openProject(path: string): Promise<{ name: string; path: string }> {
    return webServiceFs.openProject(path)
  }

  initProjectWithTemplate(_projectPath: string, _template: { schema: string; purpose: string; extraDirs: string[] }) {
    // In HTTP mode, project initialization is handled server-side
  }
}

class MemoryWebFileSystem implements WebFileSystemLike {
  private files = new Map<string, string>()
  private directories = new Set<string>(["/"])
  private modified = new Map<string, number>()

  async readFile(path: string): Promise<string> {
    return this.files.get(normalizeFsPath(path)) ?? ""
  }

  async writeFile(path: string, contents: string): Promise<void> {
    const normalized = normalizeFsPath(path)
    await this.createDirectory(parentPath(normalized))
    this.files.set(normalized, contents)
    this.modified.set(normalized, Date.now())
  }

  async writeFileAtomic(path: string, contents: string): Promise<void> {
    await this.writeFile(path, contents)
  }

  async listDirectory(path: string): Promise<FileNode[]> {
    const root = normalizeFsPath(path)
    const directChildren = new Set<string>()
    for (const dir of this.directories) {
      if (dir === root) continue
      if (parentPath(dir) === root) directChildren.add(dir)
    }
    for (const file of this.files.keys()) {
      if (parentPath(file) === root) directChildren.add(file)
    }
    return [...directChildren]
      .sort((a, b) => baseName(a).localeCompare(baseName(b)))
      .map((child) => ({
        name: baseName(child),
        path: child,
        is_dir: this.directories.has(child),
        ...(this.directories.has(child) ? { children: this.listDirectorySync(child) } : {}),
      }))
  }

  private listDirectorySync(path: string): FileNode[] {
    const root = normalizeFsPath(path)
    const directChildren = new Set<string>()
    for (const dir of this.directories) {
      if (dir === root) continue
      if (parentPath(dir) === root) directChildren.add(dir)
    }
    for (const file of this.files.keys()) {
      if (parentPath(file) === root) directChildren.add(file)
    }
    return [...directChildren]
      .sort((a, b) => baseName(a).localeCompare(baseName(b)))
      .map((child) => ({
        name: baseName(child),
        path: child,
        is_dir: this.directories.has(child),
        ...(this.directories.has(child) ? { children: this.listDirectorySync(child) } : {}),
      }))
  }

  async createDirectory(path: string): Promise<void> {
    const normalized = normalizeFsPath(path)
    const parts = normalized.split("/").filter(Boolean)
    let current = normalized.startsWith("/") ? "" : "."
    for (const part of parts) {
      current = current ? `${current}/${part}` : `/${part}`
      this.directories.add(current)
      this.modified.set(current, Date.now())
    }
    if (parts.length === 0) this.directories.add("/")
  }

  async deleteFile(path: string): Promise<void> {
    const normalized = normalizeFsPath(path)
    this.files.delete(normalized)
    this.directories.delete(normalized)
  }

  async fileExists(path: string): Promise<boolean> {
    const normalized = normalizeFsPath(path)
    return this.files.has(normalized) || this.directories.has(normalized)
  }

  async getFileModifiedTime(path: string): Promise<number> {
    return this.modified.get(normalizeFsPath(path)) ?? 0
  }

  async getFileSize(path: string): Promise<number> {
    return (this.files.get(normalizeFsPath(path)) ?? "").length
  }

  async getFileMd5(path: string): Promise<string> {
    return `${(this.files.get(normalizeFsPath(path)) ?? "").length}`
  }

  async copyFile(source: string, destination: string): Promise<void> {
    await this.writeFile(destination, await this.readFile(source))
  }

  async copyDirectory(source: string, destination: string): Promise<string[]> {
    const src = normalizeFsPath(source)
    const dest = normalizeFsPath(destination)
    const copied: string[] = []
    await this.createDirectory(dest)
    for (const file of this.files.keys()) {
      if (!file.startsWith(`${src}/`)) continue
      const target = `${dest}/${file.slice(src.length + 1)}`
      await this.writeFile(target, this.files.get(file) ?? "")
      copied.push(target)
    }
    return copied
  }

  async preprocessFile(path: string): Promise<string> {
    return this.readFile(path)
  }

  async findRelatedWikiPages(): Promise<string[]> {
    return []
  }

  async readFileAsBase64(path: string): Promise<{ base64: string; mimeType: string }> {
    return { base64: btoa(await this.readFile(path)), mimeType: "text/plain" }
  }

  async openProjectFolder(): Promise<void> {}

  async clipServerStatus(): Promise<string> {
    return "stopped"
  }

  async getExecutableDir(): Promise<string> {
    return "/"
  }

  async getResourceDir(): Promise<string> {
    return "/"
  }

  async createProject(name: string, path: string): Promise<{ name: string; path: string }> {
    await this.openProject(path)
    return { name, path }
  }

  async openProject(path: string): Promise<{ name: string; path: string }> {
    await this.createDirectory(`${path}/wiki/entities`)
    await this.createDirectory(`${path}/wiki/concepts`)
    await this.writeFile(
      `${path}/wiki/entities/示例实体.md`,
      '---\ntitle: 示例实体\ntype: entity\n---\n\n# 示例实体\n',
    )
    await this.writeFile(
      `${path}/wiki/concepts/示例概念.md`,
      '---\ntitle: 示例概念\ntype: concept\n---\n\n# 示例概念\n',
    )
    return { name: baseName(path), path }
  }

  initProjectWithTemplate(projectPath: string, template: { schema: string; purpose: string; extraDirs: string[] }) {
    void this.createDirectory(`${projectPath}/wiki`)
    for (const dir of template.extraDirs) {
      void this.createDirectory(`${projectPath}/${dir}`)
    }
  }
}

let webFsInstance: WebFileSystemLike | null = null

export function getWebFs(): WebFileSystemLike {
  if (!webFsInstance) {
    webFsInstance = typeof window === "undefined"
      ? new MemoryWebFileSystem()
      : new HttpWebFileSystem()
  }
  return webFsInstance
}
