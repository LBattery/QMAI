import { invoke } from "@tauri-apps/api/core"
import type { FileNode, WikiProject } from "@/types/wiki"
import { ensureProjectId, upsertProjectInfo } from "@/lib/project-identity"
import { isTauri } from "@/lib/platform"
import { getWebFs } from "@/lib/web-fs"
import { webServiceFs } from "@/lib/web-service-fs"

interface RawProject {
  name: string
  path: string
}

export async function readFile(path: string): Promise<string> {
  if (!isTauri()) {
    return webServiceFs.readFile(path)
  }
  return invoke<string>("read_file", { path })
}

export async function writeFile(path: string, contents: string): Promise<void> {
  if (!isTauri()) {
    return webServiceFs.writeFile(path, contents)
  }
  return invoke<void>("write_file", { path, contents })
}

export async function writeFileAtomic(path: string, contents: string): Promise<void> {
  if (!isTauri()) {
    return webServiceFs.writeFile(path, contents)
  }
  return invoke<void>("write_file_atomic", { path, contents })
}

export async function listDirectory(path: string): Promise<FileNode[]> {
  if (!isTauri()) {
    return webServiceFs.listDirectory(path)
  }
  return invoke<FileNode[]>("list_directory", { path })
}

export async function copyFile(
  source: string,
  destination: string
): Promise<void> {
  if (!isTauri()) {
    return webServiceFs.copyFile(source, destination)
  }
  return invoke("copy_file", { source, destination })
}

export async function copyDirectory(
  source: string,
  destination: string
): Promise<string[]> {
  if (!isTauri()) {
    return webServiceFs.copyDirectory(source, destination)
  }
  return invoke<string[]>("copy_directory", { source, destination })
}

export async function preprocessFile(path: string): Promise<string> {
  if (!isTauri()) {
    return webServiceFs.readFile(path)
  }
  return invoke<string>("preprocess_file", { path })
}

export async function deleteFile(path: string): Promise<void> {
  if (!isTauri()) {
    return webServiceFs.deleteFile(path)
  }
  return invoke("delete_file", { path })
}

export async function findRelatedWikiPages(
  projectPath: string,
  sourceName: string
): Promise<string[]> {
  if (!isTauri()) {
    return getWebFs().findRelatedWikiPages(projectPath, sourceName)
  }
  return invoke<string[]>("find_related_wiki_pages", { projectPath, sourceName })
}

export async function createDirectory(path: string): Promise<void> {
  if (!isTauri()) {
    return webServiceFs.createDirectory(path)
  }
  return invoke<void>("create_directory", { path })
}

export async function fileExists(path: string): Promise<boolean> {
  if (!isTauri()) {
    return webServiceFs.fileExists(path)
  }
  return invoke<boolean>("file_exists", { path })
}

export async function getFileModifiedTime(path: string): Promise<number> {
  if (!isTauri()) {
    return webServiceFs.getFileModifiedTime(path)
  }
  return invoke<number>("get_file_modified_time", { path })
}

export async function getFileSize(path: string): Promise<number> {
  if (!isTauri()) {
    return webServiceFs.getFileSize(path)
  }
  return invoke<number>("get_file_size", { path })
}

export async function getFileMd5(path: string): Promise<string> {
  if (!isTauri()) {
    return webServiceFs.getFileMd5(path)
  }
  return invoke<string>("get_file_md5", { path })
}

export interface FileBase64 {
  base64: string
  mimeType: string
}

export async function readFileAsBase64(path: string): Promise<FileBase64> {
  if (!isTauri()) {
    return webServiceFs.readFileAsBase64(path)
  }
  return invoke<FileBase64>("read_file_as_base64", { path })
}

export async function createProject(
  name: string,
  path: string,
): Promise<WikiProject> {
  if (!isTauri()) {
    const raw = await webServiceFs.createProject(name, path)
    const id = await ensureProjectId(raw.path)
    await upsertProjectInfo(id, raw.path, raw.name)
    return { id, name: raw.name, path: raw.path }
  }
  const raw = await invoke<RawProject>("create_project", { name, path })
  const id = await ensureProjectId(raw.path)
  await upsertProjectInfo(id, raw.path, raw.name)
  return { id, name: raw.name, path: raw.path }
}

export async function openProject(path: string): Promise<WikiProject> {
  if (!isTauri()) {
    const raw = await webServiceFs.openProject(path)
    const id = await ensureProjectId(raw.path)
    await upsertProjectInfo(id, raw.path, raw.name)
    return { id, name: raw.name, path: raw.path }
  }
  const raw = await invoke<RawProject>("open_project", { path })
  const id = await ensureProjectId(raw.path)
  await upsertProjectInfo(id, raw.path, raw.name)
  return { id, name: raw.name, path: raw.path }
}

export async function openProjectFolder(path: string): Promise<void> {
  if (!isTauri()) {
    return getWebFs().openProjectFolder(path)
  }
  return invoke<void>("open_project_folder", { path })
}

export async function openFileLocation(path: string): Promise<void> {
  if (!isTauri()) {
    return
  }
  return invoke<void>("open_file_location", { path })
}

export async function clipServerStatus(): Promise<string> {
  if (!isTauri()) {
    return getWebFs().clipServerStatus()
  }
  return invoke<string>("clip_server_status")
}

export async function getExecutableDir(): Promise<string> {
  if (!isTauri()) {
    return webServiceFs.getExecutableDir()
  }
  return invoke<string>("get_executable_dir")
}

export async function getResourceDir(): Promise<string> {
  if (!isTauri()) {
    return webServiceFs.getResourceDir()
  }
  return invoke<string>("get_resource_dir")
}
