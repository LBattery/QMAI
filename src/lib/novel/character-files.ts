/**
 * 独立角色文件管理
 *
 * 支持 wiki/characters/ 目录，每个主要角色一个独立 .md 文件。
 * 角色文件模板包含：基本信息、外在表现、内在分析、语言风格、出场记录、别名。
 */
import { createDirectory, fileExists, listDirectory, readFile, writeFile } from "@/commands/fs"
import { normalizePath } from "@/lib/path-utils"
import { makeSafeFileSlug } from "@/lib/wiki-filename"

export const CHARACTERS_DIR = "wiki/characters"

export interface CharacterFileData {
  name: string
  aliases: string[]
  basicInfo: string
  appearance: string
  innerAnalysis: string
  languageStyle: string
 出场记录: string
}

export const CHARACTER_FILE_TEMPLATE = `---
type: character
---

# {name}

## 基本信息

{basicInfo}

## 外在表现

{appearance}

## 内在分析

{innerAnalysis}

## 语言风格

{languageStyle}

## 出场记录

{appearanceRecords}

## 别名

{aliases}
`

function buildCharacterFileContent(data: CharacterFileData): string {
  const aliasesText = data.aliases.length > 0 ? data.aliases.join("、") : "暂无"
  return CHARACTER_FILE_TEMPLATE
    .replace("{name}", data.name)
    .replace("{basicInfo}", data.basicInfo || "待补充")
    .replace("{appearance}", data.appearance || "待补充")
    .replace("{innerAnalysis}", data.innerAnalysis || "待补充")
    .replace("{languageStyle}", data.languageStyle || "待补充")
    .replace("{appearanceRecords}", data.出场记录 || "待补充")
    .replace("{aliases}", aliasesText)
}

function charactersDir(projectPath: string): string {
  return `${normalizePath(projectPath)}/${CHARACTERS_DIR}`
}

function characterFilePath(projectPath: string, name: string): string {
  return `${charactersDir(projectPath)}/${makeSafeFileSlug(name)}.md`
}

/**
 * 创建角色文件。如果文件已存在，返回现有路径。
 */
export async function createCharacterFile(
  projectPath: string,
  data: CharacterFileData,
): Promise<string> {
  const dir = charactersDir(projectPath)
  await createDirectory(dir)
  const filePath = characterFilePath(projectPath, data.name)
  if (await fileExists(filePath)) return filePath
  const content = buildCharacterFileContent(data)
  await writeFile(filePath, content)
  return filePath
}

/**
 * 读取角色文件内容。返回原始 markdown 文本。
 */
export async function readCharacterFile(
  projectPath: string,
  characterName: string,
): Promise<string> {
  const filePath = characterFilePath(projectPath, characterName)
  return await readFile(filePath)
}

/**
 * 更新角色文件内容。
 */
export async function updateCharacterFile(
  projectPath: string,
  characterName: string,
  content: string,
): Promise<void> {
  const filePath = characterFilePath(projectPath, characterName)
  await writeFile(filePath, content)
}

/**
 * 列出所有角色文件名（不含路径和扩展名）。
 */
export async function listCharacterFiles(projectPath: string): Promise<string[]> {
  const dir = charactersDir(projectPath)
  try {
    const nodes = await listDirectory(dir)
    return nodes
      .filter((node) => !node.is_dir && node.name.endsWith(".md"))
      .map((node) => node.name.replace(/\.md$/, ""))
      .sort((a, b) => a.localeCompare(b, "zh-CN"))
  } catch {
    return []
  }
}

/**
 * 检查角色文件是否存在。
 */
export async function characterFileExists(
  projectPath: string,
  characterName: string,
): Promise<boolean> {
  return fileExists(characterFilePath(projectPath, characterName))
}

/**
 * 获取角色文件路径。
 */
export function getCharacterFilePath(projectPath: string, characterName: string): string {
  return characterFilePath(projectPath, characterName)
}
