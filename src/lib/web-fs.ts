import { httpFs } from "@/lib/http-adapter"
import { httpProject } from "@/lib/http-adapter"
import type { FileNode } from "@/types/wiki"

class WebFileSystem {
  async readFile(path: string): Promise<string> {
    return httpFs.readFile(path)
  }

  async writeFile(path: string, contents: string): Promise<void> {
    return httpFs.writeFile(path, contents)
  }

  async writeFileAtomic(path: string, contents: string): Promise<void> {
    return httpFs.writeFileAtomic(path, contents)
  }

  async listDirectory(path: string): Promise<FileNode[]> {
    return httpFs.listDirectory(path)
  }

  async createDirectory(path: string): Promise<void> {
    return httpFs.createDirectory(path)
  }

  async deleteFile(path: string): Promise<void> {
    return httpFs.deleteFile(path)
  }

  async fileExists(path: string): Promise<boolean> {
    return httpFs.fileExists(path)
  }

  async getFileModifiedTime(path: string): Promise<number> {
    return httpFs.getFileModifiedTime(path)
  }

  async getFileSize(path: string): Promise<number> {
    return httpFs.getFileSize(path)
  }

  async getFileMd5(path: string): Promise<string> {
    return httpFs.getFileMd5(path)
  }

  async copyFile(source: string, destination: string): Promise<void> {
    return httpFs.copyFile(source, destination)
  }

  async copyDirectory(source: string, destination: string): Promise<string[]> {
    return httpFs.copyDirectory(source, destination)
  }

  async preprocessFile(path: string): Promise<string> {
    return httpFs.preprocessFile(path)
  }

  async findRelatedWikiPages(projectPath: string, sourceName: string): Promise<string[]> {
    return httpFs.findRelatedWikiPages(projectPath, sourceName)
  }

  async readFileAsBase64(path: string): Promise<{ base64: string; mimeType: string }> {
    return httpFs.readFileAsBase64(path)
  }

  async openProjectFolder(path: string): Promise<void> {
    return httpProject.openFolder(path)
  }

  async clipServerStatus(): Promise<string> {
    const { httpClip } = await import("@/lib/http-adapter")
    return httpClip.status()
  }

  async getExecutableDir(): Promise<string> {
    return httpFs.getExecutableDir()
  }

  async getResourceDir(): Promise<string> {
    return httpFs.getResourceDir()
  }

  async createProject(name: string, path: string): Promise<{ name: string; path: string }> {
    return httpProject.create(name, path)
  }

  async openProject(path: string): Promise<{ name: string; path: string }> {
    return httpProject.open(path)
  }

  initProjectWithTemplate(_projectPath: string, _template: { schema: string; purpose: string; extraDirs: string[] }) {
    // In HTTP mode, project initialization is handled server-side
  }
}

let webFsInstance: WebFileSystem | null = null

export function getWebFs(): WebFileSystem {
  if (!webFsInstance) {
    webFsInstance = new WebFileSystem()
  }
  return webFsInstance
}
