/**
 * 写作前找大纲协议：先钉目标章号，再按 type 分流，最后读正文判断归属。
 * 不依赖文件名规范，也不要求大纲正文写法统一。
 */

import type { NovelTaskIntent } from "./task-router"

/** 需要「按目标章找纲」协议的章节写作意图（不含大纲生成） */
export const OUTLINE_FIND_CHAPTER_INTENTS = new Set<NovelTaskIntent>([
  "write_chapter",
  "continue_chapter",
  "rewrite_chapter",
  "polish_chapter",
])

export function shouldIncludeOutlineFindProtocol(intent?: string | null): boolean {
  return Boolean(intent && OUTLINE_FIND_CHAPTER_INTENTS.has(intent as NovelTaskIntent))
}

export function buildOutlineFindProtocol(targetChapterNumber?: number): string {
  const targetLine =
    typeof targetChapterNumber === "number" && targetChapterNumber > 0
      ? `本次写作目标：第 ${targetChapterNumber} 章。后续找大纲必须以该章号为准。`
      : "写作前必须先明确本次要写的目标章号 N（可从任务路由、list_chapters 的最新章+1，或用户明示获得）。"

  return [
    "## 大纲定位协议（写章节前必须遵守）",
    "",
    targetLine,
    "1. 调用 list_outlines 查看全部大纲候选及其 type / outline_type；先扫一遍有哪些 overview / concept / outline，不要只盯卷纲文件名。",
    "2. 按 type 分流处理（有 type 用 type；无 type 则读正文判断用途）：",
    "   - overview（高优先级入口）：应优先 read_outline 读索引，按 related / 文档表发现必须遵守的规则文档与卷纲入口；不要跳过 overview 直接瞎点卷纲。overview 本身不是本章剧情大纲。",
    "   - concept / 设定类（写作硬约束）：列表中出现的 concept 默认视为全书机制/叙述禁则；写正文前应至少读与本次任务相关的 concept（有 overview 指引时按指引读；无指引时对列出的 concept 做必要性判断并读取关键项）。不要用章号去「匹配」concept，也不要把它们当成卷纲。",
    "   - outline（及 outline_type 为 story/volume/chapter-outline 等）：主候选；必须 read_outline 读正文，判断是否对应该章 / 当前阶段。",
    "   - 未知 type：必须读正文判断是卷纲、章纲、设定还是清单。",
    "3. 同为 outline 也可能不是卷纲（如资产明细、人物表）；禁止只看 type 或文件名就选定。",
    "4. 确认对应该章的大纲，并已知相关 overview/concept 约束后，再写作或调用 run_chapter_workflow。",
    "禁止只凭文件名猜测分卷；禁止把 concept/overview 当成章节剧情大纲；禁止在未查看 overview/concept 的情况下只读一份卷纲就开写。",
  ].join("\n")
}

export function formatTargetChapterLine(chapterNumber: number): string {
  return `本次写作目标：第 ${chapterNumber} 章。`
}

/** 从已拼接的系统提示中移除找纲协议块，避免与 plugin 重复注入。 */
export function stripOutlineFindProtocol(prompt: string): string {
  return prompt
    .replace(/\n*## 大纲定位协议（写章节前必须遵守）\n[\s\S]*?(?=\n## |\n*$)/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
