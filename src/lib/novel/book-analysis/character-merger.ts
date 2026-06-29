/**
 * 角色合并逻辑
 * 将多个被错误拆分的同一角色（如"夹克男""鲍博""博哥"）合并为一个
 */

import type { ExtractedCharacter, PersonalityProfile } from "./types"
import { buildNameAliasMap } from "./alias-resolver"
import { persistCharacterToDisk } from "./character-disk-store"
import { generateSimpleSkillMarkdown } from "./skill-generator"
import { ALL_DIMENSIONS, DIMENSION_LABELS } from "./six-dimension-prompts"
import { loadRecognizedCharacters, saveRecognizedCharacters } from "./recognized-character-store"
import { writeFile, deleteFile } from "@/commands/fs"
import { joinPath, normalizePath } from "@/lib/path-utils"

/** 分类优先级：数值越大优先级越高 */
const CATEGORY_PRIORITY: Record<string, number> = {
  minor: 0,
  supporting: 1,
  antagonist: 2,
  protagonist: 3,
}

/**
 * 纯合并逻辑：将 others 合并到 primary，返回合并后的角色
 */
export function mergeCharacters(
  primary: ExtractedCharacter,
  others: ExtractedCharacter[],
): ExtractedCharacter {
  const all = [primary, ...others]

  // aliases：合并所有角色的 aliases + 被合并角色的 name（去重，去掉主角色名自身）
  const aliasSet = new Set<string>()
  for (const c of all) {
    if (c.name !== primary.name) aliasSet.add(c.name)
    for (const a of c.aliases) {
      if (a !== primary.name) aliasSet.add(a)
    }
  }
  const mergedAliases = Array.from(aliasSet)

  // importance：取最大值
  const mergedImportance = Math.max(...all.map((c) => c.importance))

  // category：取最高级别
  const mergedCategory = all.reduce<ExtractedCharacter["category"]>(
    (best, c) =>
      (CATEGORY_PRIORITY[c.category] ?? 0) > (CATEGORY_PRIORITY[best] ?? 0) ? c.category : best,
    primary.category,
  )

  // firstAppearance / lastAppearance：取最宽范围
  const mergedFirstAppearance = Math.min(...all.map((c) => c.firstAppearance))
  const mergedLastAppearance = Math.max(...all.map((c) => c.lastAppearance))

  // appearanceCount：求和
  const mergedAppearanceCount = all.reduce((sum, c) => sum + c.appearanceCount, 0)

  // 文本字段：主角色优先，为空则依次取其他角色的
  const firstNonEmpty = (field: keyof Pick<ExtractedCharacter, "description" | "personality" | "speechStyle" | "corpus">) => {
    for (const c of all) {
      if (c[field]) return c[field]
    }
    return ""
  }

  // relationships：合并去重（按 target 去重，主角色优先）
  const relMap = new Map<string, ExtractedCharacter["relationships"][number]>()
  for (const c of all) {
    for (const r of c.relationships) {
      if (!relMap.has(r.target)) {
        relMap.set(r.target, r)
      }
    }
  }

  // keyEvents：合并
  const mergedKeyEvents = all.flatMap((c) => c.keyEvents)

  // personalityProfile：主角色优先，为空则取其他
  const mergedProfile = mergePersonalityProfile(
    primary.personalityProfile,
    ...others.map((c) => c.personalityProfile),
  )

  // aliasMap：重建
  const mergedAliasMap = buildNameAliasMap(primary.name, mergedAliases)

  return {
    id: primary.id,
    name: primary.name,
    aliases: mergedAliases,
    importance: mergedImportance,
    category: mergedCategory,
    firstAppearance: mergedFirstAppearance,
    lastAppearance: mergedLastAppearance,
    appearanceCount: mergedAppearanceCount,
    description: firstNonEmpty("description"),
    personality: firstNonEmpty("personality"),
    speechStyle: firstNonEmpty("speechStyle"),
    relationships: Array.from(relMap.values()),
    keyEvents: mergedKeyEvents,
    corpus: firstNonEmpty("corpus") || undefined,
    aliasMap: mergedAliasMap,
    sixDimensionResearch: primary.sixDimensionResearch || others.find((c) => c.sixDimensionResearch)?.sixDimensionResearch || undefined,
    sixDimensionMeta: primary.sixDimensionMeta || others.find((c) => c.sixDimensionMeta)?.sixDimensionMeta || undefined,
    personalityProfile: mergedProfile || undefined,
    simpleExtractionMeta: primary.simpleExtractionMeta || others.find((c) => c.simpleExtractionMeta)?.simpleExtractionMeta || undefined,
  }
}

/**
 * 合并 PersonalityProfile：主角色优先，空字段从备选中取
 */
function mergePersonalityProfile(
  primary?: PersonalityProfile,
  ...fallbacks: (PersonalityProfile | undefined)[]
): PersonalityProfile | undefined {
  const all = [primary, ...fallbacks].filter((p): p is PersonalityProfile => !!p)
  if (all.length === 0) return undefined

  const first = (field: keyof PersonalityProfile): string => {
    for (const p of all) {
      const val = p[field]
      if (typeof val === "string" && val) return val
    }
    return ""
  }

  const quotes = all.flatMap((p) => p.quotes)
  // 去重（按原文完全一致去重），保留最多 8 条
  const seen = new Set<string>()
  const uniqueQuotes: string[] = []
  for (const q of quotes) {
    if (!seen.has(q)) {
      seen.add(q)
      uniqueQuotes.push(q)
      if (uniqueQuotes.length >= 8) break
    }
  }

  return {
    personality: first("personality"),
    motivation: first("motivation"),
    speechStyle: first("speechStyle"),
    behaviorPatterns: first("behaviorPatterns"),
    quotes: uniqueQuotes,
  }
}

/**
 * 获取角色 Skill 文件的安全文件名（与 skill-generator.ts 一致）
 */
function safeSkillFileName(name: string): string {
  return `${name.replace(/[^一-龥a-zA-Z0-9]/g, "_")}-skill.md`
}

/**
 * 构建 6 维度 Skill 骨架（不依赖 BookAnalysisMetadata，用于合并场景）
 * 逻辑与 skill-generator.ts 中 buildSixDimensionSkeleton 一致，但接受 bookTitle 字符串
 */
function buildSixDimensionSkeletonFromTitle(
  character: ExtractedCharacter,
  bookTitle: string,
): string {
  const research = character.sixDimensionResearch!
  const meta = character.sixDimensionMeta!
  const aliasNames = character.aliasMap
    ? [character.aliasMap.canonical, ...character.aliasMap.aliases]
    : [character.name, ...character.aliases]
  const aliasText = Array.from(new Set(aliasNames)).filter(Boolean).join("、")

  const lines: string[] = []
  lines.push(`---`)
  lines.push(`name: ${character.name}`)
  lines.push(`description: ${character.description.substring(0, 100)}`)
  lines.push(`sourceBook: ${bookTitle}`)
  lines.push(`category: character-skill`)
  lines.push(`schema: 6d`)
  lines.push(`analysisDepth: ${meta.depth}`)
  lines.push(`webSearchUsed: ${meta.webSearchUsed}`)
  lines.push(`sourceNote: ${meta.sourceNote}`)
  lines.push(`generatedAt: ${meta.generatedAt}`)
  lines.push(`---`)
  lines.push(``)
  lines.push(`# ${character.name}`)
  lines.push(``)
  lines.push(`> 6 维度分析 · 深度：${meta.depth} · ${meta.sourceNote}`)
  lines.push(``)
  lines.push(`## 角色别名 / 称谓`)
  lines.push(``)
  lines.push(aliasText)
  lines.push(``)
  lines.push(`## 角色总览`)
  lines.push(``)
  lines.push(`- **分类**：${character.category}`)
  lines.push(`- **首次出现**：第 ${character.firstAppearance} 章`)
  lines.push(`- **最后一次出现**：第 ${character.lastAppearance} 章`)
  lines.push(`- **出现次数**：${character.appearanceCount} 次`)
  lines.push(``)

  for (const key of ALL_DIMENSIONS) {
    lines.push(`## ${DIMENSION_LABELS[key]}`)
    lines.push(``)
    lines.push(research[key] || `（空）`)
    lines.push(``)
  }

  return lines.join("\n")
}

/**
 * 持久化合并结果到磁盘
 * 1. 写入合并后的角色 JSON
 * 2. 删除被合并角色的 JSON 和 Skill 文件
 * 3. 重新生成主角色的 Skill 文件
 * 4. 更新 recognized-characters.json
 */
export async function persistMergedCharacter(
  bookPath: string,
  merged: ExtractedCharacter,
  deletedCharacters: ExtractedCharacter[],
  bookTitle?: string,
): Promise<void> {
  // 1. 写入合并后的角色 JSON
  await persistCharacterToDisk(bookPath, merged)

  // 2. 删除被合并角色的 JSON 和 Skill 文件
  for (const deleted of deletedCharacters) {
    const charPath = normalizePath(joinPath(bookPath, "characters", `${deleted.id}.json`))
    await deleteFile(charPath).catch(() => { /* 文件可能不存在 */ })

    const skillPath = normalizePath(joinPath(bookPath, "skills", safeSkillFileName(deleted.name)))
    await deleteFile(skillPath).catch(() => { /* 文件可能不存在 */ })
  }

  // 3. 重新生成主角色的 Skill 文件
  let skillContent: string
  if (merged.personalityProfile) {
    skillContent = generateSimpleSkillMarkdown({
      characterName: merged.name,
      profile: merged.personalityProfile,
      sourceBook: bookTitle,
    })
  } else if (merged.sixDimensionResearch && merged.sixDimensionMeta) {
    skillContent = buildSixDimensionSkeletonFromTitle(merged, bookTitle ?? "未知")
  } else {
    // fallback：用已有文本字段组装
    skillContent = generateSimpleSkillMarkdown({
      characterName: merged.name,
      profile: {
        personality: merged.personality,
        motivation: "",
        speechStyle: merged.speechStyle,
        behaviorPatterns: "",
        quotes: [],
      },
      sourceBook: bookTitle,
    })
  }

  const skillPath = normalizePath(joinPath(bookPath, "skills", safeSkillFileName(merged.name)))
  await writeFile(skillPath, skillContent)

  // 4. 更新 recognized-characters.json
  try {
    const recognized = await loadRecognizedCharacters(bookPath)
    const deletedIds = new Set(deletedCharacters.map((c) => c.id))
    const updated = recognized
      .filter((c) => !deletedIds.has(c.id))
      .map((c) => {
        if (c.id === merged.id) {
          return { ...c, aliases: merged.aliases, name: merged.name }
        }
        return c
      })
    await saveRecognizedCharacters(bookPath, updated)
  } catch {
    // recognized-characters.json 可能不存在，忽略
  }
}
